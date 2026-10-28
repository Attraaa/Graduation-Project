import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test, { type TestContext } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import mysql from 'mysql2/promise';
import type { Pool } from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { comparePassword, hashPassword } from '../src/auth.js';
import { handleError } from '../src/http.js';
import { createRecoveryRouter } from '../src/routes/recovery.js';
import type { Mailer, MailMessage } from '../src/services/mail.js';

/**
 * The same scenarios run against an in-memory stand-in and, when MOTI_TEST_MYSQL_URL is set, against a
 * temporary MySQL database that is dropped afterwards (as in records-repository.test.ts).
 */
const url = process.env.MOTI_TEST_MYSQL_URL;
const SKIP_MYSQL = url ? false : 'set MOTI_TEST_MYSQL_URL to run against a temporary MySQL database';
const EXPIRED = { status: 400, message: '인증 코드가 만료되었거나 입력 횟수를 넘었습니다. 인증 코드를 다시 받아 주세요.' };

interface Database {
  pool: Pool;
  addUser(username: string, email: string | null): Promise<number>;
  passwordHash(userId: number): Promise<string>;
  storedCode(userId: number): Promise<string | null>;
  expire(userId: number): Promise<void>;
}
type Open = (t: TestContext) => Promise<Database>;

/** Follows the statements in routes/recovery.ts; any other statement fails the test. */
function memoryDatabase(): Database & { queries: () => number } {
  const users: { id: number; username: string; email: string | null; passwordHash: string }[] = [];
  const codes = new Map<number, { hash: string; expiresAt: number; attempts: number }>();
  let queries = 0;
  const changed = (affectedRows: number) => [{ affectedRows }];
  const query = async (sql: string, [first, second]: unknown[]) => {
    queries += 1;
    if (sql.startsWith('SELECT username FROM users WHERE email = ?')) {
      return [users.filter(user => user.email === first).map(({ username }) => ({ username }))];
    }
    if (sql.startsWith('SELECT id FROM users WHERE username = ? AND email = ?')) {
      return [users.filter(user => user.username === first && user.email === second).map(({ id }) => ({ id }))];
    }
    if (sql.startsWith('SELECT id FROM users WHERE username = ?')) return [users.filter(user => user.username === first).map(({ id }) => ({ id }))];
    if (sql.startsWith('INSERT INTO password_reset_codes')) {
      codes.set(first as number, { hash: second as string, expiresAt: Date.now() + 600_000, attempts: 0 });
      return changed(1);
    }
    if (sql.startsWith('UPDATE password_reset_codes SET attempts = attempts + 1')) {
      const code = codes.get(first as number);
      if (!code || code.attempts >= (second as number) || code.expiresAt <= Date.now()) return changed(0);
      code.attempts += 1;
      return changed(1);
    }
    if (sql.startsWith('UPDATE password_reset_codes SET attempts = attempts - 1')) {
      const code = codes.get(first as number);
      if (!code || code.attempts <= 0) return changed(0);
      code.attempts -= 1;
      return changed(1);
    }
    if (sql.startsWith('SELECT user_id FROM password_reset_codes WHERE user_id = ? AND code_hash = ?')) {
      return [codes.get(first as number)?.hash === second ? [{ user_id: first }] : []];
    }
    if (sql.startsWith('DELETE FROM password_reset_codes')) {
      if (codes.get(first as number)?.hash !== second) return changed(0);
      codes.delete(first as number);
      return changed(1);
    }
    if (sql.startsWith('UPDATE users SET password_hash = ?')) {
      const user = users.find(({ id }) => id === second);
      if (user) user.passwordHash = first as string;
      return changed(user ? 1 : 0);
    }
    throw new Error(`unexpected query: ${sql}`);
  };
  return {
    pool: { query } as unknown as Pool,
    queries: () => queries,
    addUser: async (username, email) => {
      users.push({ id: users.length + 1, username, email, passwordHash: await hashPassword('old-password') });
      return users.length;
    },
    passwordHash: async userId => users.find(({ id }) => id === userId)!.passwordHash,
    storedCode: async userId => codes.get(userId)?.hash ?? null,
    expire: async userId => { codes.get(userId)!.expiresAt = 0; },
  };
}

async function mysqlDatabase(t: TestContext, schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')): Promise<Database> {
  const name = `moti_recovery_test_${randomBytes(6).toString('hex')}`;
  const admin = await mysql.createConnection({ uri: url, multipleStatements: true });
  await admin.query(`CREATE DATABASE \`${name}\``);
  t.after(async () => { await admin.query(`DROP DATABASE \`${name}\``); await admin.end(); });
  await admin.query(`USE \`${name}\``);
  await admin.query(schema);
  const pool = mysql.createPool({ uri: url, database: name, connectionLimit: 4 });
  t.after(() => pool.end());
  const one = async (sql: string, userId: number) => (await pool.query<RowDataPacket[]>(sql, [userId]))[0][0];
  return {
    pool,
    addUser: async (username, email) => {
      const [result] = await pool.query<ResultSetHeader>(
        'INSERT INTO users (username, nickname, email, password_hash) VALUES (?, ?, ?, ?)',
        [username, username, email, await hashPassword('old-password')],
      );
      return result.insertId;
    },
    passwordHash: async userId => (await one('SELECT password_hash FROM users WHERE id = ?', userId)).password_hash,
    storedCode: async userId => (await one('SELECT code_hash FROM password_reset_codes WHERE user_id = ?', userId))?.code_hash ?? null,
    expire: async userId => { await pool.query('UPDATE password_reset_codes SET expires_at = NOW() - INTERVAL 1 SECOND WHERE user_id = ?', [userId]); },
  };
}

function mailbox() {
  const sent: MailMessage[] = [];
  const mailer: Mailer = async message => { sent.push(message); };
  return { sent, mailer, code: () => /인증 코드: (\d{6})/.exec(sent.at(-1)!.text)![1] };
}
const otherCode = (code: string) => code === '000000' ? '000001' : '000000';

async function start(t: TestContext, pool: Pool, mailer: Mailer | null) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createRecoveryRouter(pool, mailer));
  app.use(handleError);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`;
  return async (path: string, body: unknown) => {
    const response = await fetch(base + path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    return { status: response.status, message: (await response.json() as { message: string }).message };
  };
}

test('without SMTP settings both mail routes answer 503 before reading the database', async t => {
  const db = memoryDatabase();
  const post = await start(t, db.pool, null);
  for (const [path, body] of [['/find-id', { email: 'a@example.com' }], ['/password-reset', { username: 'a', email: 'a@example.com' }]] as const) {
    assert.deepEqual(await post(path, body), { status: 503, message: '메일 발송이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.' });
  }
  assert.equal(db.queries(), 0);
});

test('malformed addresses, codes and passwords are rejected before reading the database', async t => {
  const db = memoryDatabase();
  const post = await start(t, db.pool, mailbox().mailer);
  for (const email of ['member', 'a@b', '"a>b"@example.com', 'a;b@example.com', 'a@example.com (comment)']) {
    assert.equal((await post('/find-id', { email })).status, 400, email);
    assert.equal((await post('/password-reset', { username: 'member', email })).status, 400, email);
  }
  for (const body of [{ code: '12345', newPassword: 'new-password' }, { code: 'abcdef', newPassword: 'new-password' },
    { code: '1234567', newPassword: 'new-password' }, { code: '123456' }]) {
    assert.equal((await post('/password-reset/confirm', { username: 'member', ...body })).status, 400, JSON.stringify(body));
  }
  for (const body of [{ code: '12345' }, { code: 'abcdef' }, { code: '1234567' }, {}]) {
    assert.equal((await post('/password-reset/verify', { username: 'member', ...body })).status, 400, JSON.stringify(body));
  }
  assert.equal(db.queries(), 0);
});

test('a failed send answers 502 and the same request can be retried at once', async t => {
  t.mock.method(console, 'error', () => undefined);
  const db = memoryDatabase();
  await db.addUser('member', 'member@example.com');
  const sent: MailMessage[] = [];
  let failures = 1;
  const post = await start(t, db.pool, async message => {
    if (failures-- > 0) throw new Error('SMTP unavailable');
    sent.push(message);
  });
  assert.deepEqual(await post('/find-id', { email: 'member@example.com' }), { status: 502, message: '메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  assert.equal((await post('/find-id', { email: 'member@example.com' })).status, 200);
  assert.equal(sent.length, 1);
});

test('004 adds the reset-code table to a database at 003 and keeps its users', { skip: SKIP_MYSQL }, async t => {
  const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  const db = await mysqlDatabase(t, schema.split('-- 17.')[0]);
  const id = await db.addUser('member', 'member@example.com');
  await assert.rejects(db.storedCode(id), /password_reset_codes/);
  await db.pool.query(readFileSync(new URL('../migrations/004_password_reset_codes.sql', import.meta.url), 'utf8'));
  assert.equal(await db.storedCode(id), null);
  assert.equal(await comparePassword('old-password', await db.passwordHash(id)), true);
});

const backends: [string, Open, false | string][] = [
  ['memory', async () => memoryDatabase(), false],
  ['MySQL', t => mysqlDatabase(t), SKIP_MYSQL],
];

for (const [label, open, skip] of backends) {
  test(`${label}: finding an ID mails every ID of the address and answers the same when none match`, { skip }, async t => {
    const db = await open(t);
    await db.addUser('first', 'shared@example.com');
    await db.addUser('second', 'shared@example.com');
    await db.addUser('other', 'other@example.com');
    const mail = mailbox();
    const post = await start(t, db.pool, mail.mailer);
    const found = await post('/find-id', { email: ' Shared@Example.COM ' });
    assert.deepEqual(found, { status: 200, message: '입력한 이메일로 가입한 아이디가 있으면 메일로 보냈습니다. 메일함을 확인해 주세요.' });
    assert.equal(mail.sent.length, 1);
    assert.equal(mail.sent[0].to, 'shared@example.com');
    assert.match(mail.sent[0].text, /- first\n- second\n/);
    assert.doesNotMatch(mail.sent[0].text, /- other/);
    assert.deepEqual(await post('/find-id', { email: 'nobody@example.com' }), found);
    assert.equal(mail.sent.length, 1);
    assert.equal((await post('/find-id', { email: 'shared@example.com' })).status, 429);
  });

  test(`${label}: a reset code is mailed once a minute and only its hash is stored`, { skip }, async t => {
    const db = await open(t);
    const id = await db.addUser('member', 'member@example.com');
    const mail = mailbox();
    const post = await start(t, db.pool, mail.mailer);
    const sent = await post('/password-reset', { username: 'member', email: 'MEMBER@example.com' });
    assert.deepEqual(sent, { status: 200, message: '아이디와 이메일이 맞으면 인증 코드를 메일로 보냈습니다. 10분 안에 입력해 주세요.' });
    assert.equal(mail.sent.length, 1);
    assert.equal(mail.sent[0].to, 'member@example.com');
    const stored = await db.storedCode(id);
    assert.match(stored ?? '', /^[0-9a-f]{64}$/);
    assert.deepEqual(await post('/password-reset', { username: 'member', email: 'wrong@example.com' }), sent);
    assert.deepEqual(await post('/password-reset', { username: 'nobody', email: 'member@example.com' }), sent);
    assert.equal(mail.sent.length, 1);
    assert.equal((await post('/password-reset', { username: 'member', email: 'member@example.com' })).status, 429);
  });

  test(`${label}: the right code resets the password once`, { skip }, async t => {
    const db = await open(t);
    const id = await db.addUser('member', 'member@example.com');
    const mail = mailbox();
    const post = await start(t, db.pool, mail.mailer);
    await post('/password-reset', { username: 'member', email: 'member@example.com' });
    const code = mail.code();
    assert.deepEqual(await post('/password-reset/confirm', { username: 'member', code: otherCode(code), newPassword: 'new-password' }),
      { status: 400, message: '인증 코드가 맞지 않습니다.' });
    assert.equal(await comparePassword('old-password', await db.passwordHash(id)), true);
    assert.deepEqual(await post('/password-reset/confirm', { username: 'member', code, newPassword: 'new-password' }),
      { status: 200, message: '비밀번호를 재설정했습니다. 새 비밀번호로 로그인해 주세요.' });
    assert.equal(await comparePassword('new-password', await db.passwordHash(id)), true);
    assert.equal(await db.storedCode(id), null);
    assert.deepEqual(await post('/password-reset/confirm', { username: 'member', code, newPassword: 'other-password' }), EXPIRED);
    assert.equal(await comparePassword('new-password', await db.passwordHash(id)), true);
  });

  test(`${label}: checking the code first keeps it for the new password and gives a right check its attempt back`, { skip }, async t => {
    const db = await open(t);
    const id = await db.addUser('member', 'member@example.com');
    const mail = mailbox();
    const post = await start(t, db.pool, mail.mailer);
    await post('/password-reset', { username: 'member', email: 'member@example.com' });
    const code = mail.code();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      assert.deepEqual(await post('/password-reset/verify', { username: 'member', code: otherCode(code) }),
        { status: 400, message: '인증 코드가 맞지 않습니다.' });
    }
    // Four misses and a right check leave one attempt, which the confirmation spends.
    assert.deepEqual(await post('/password-reset/verify', { username: 'member', code }),
      { status: 200, message: '인증되었습니다. 새 비밀번호를 입력해 주세요.' });
    assert.equal(await comparePassword('old-password', await db.passwordHash(id)), true);
    assert.equal((await post('/password-reset/confirm', { username: 'member', code, newPassword: 'new-password' })).status, 200);
    assert.equal(await comparePassword('new-password', await db.passwordHash(id)), true);
    assert.deepEqual(await post('/password-reset/verify', { username: 'member', code }), EXPIRED);
  });

  test(`${label}: five wrong codes or an expired code need a new code`, { skip }, async t => {
    const db = await open(t);
    const guessed = await db.addUser('guessed', 'guessed@example.com');
    const late = await db.addUser('late', 'late@example.com');
    const mail = mailbox();
    const post = await start(t, db.pool, mail.mailer);
    await post('/password-reset', { username: 'guessed', email: 'guessed@example.com' });
    const code = mail.code();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal((await post('/password-reset/confirm', { username: 'guessed', code: otherCode(code), newPassword: 'new-password' })).status, 400);
    }
    assert.deepEqual(await post('/password-reset/verify', { username: 'guessed', code }), EXPIRED);
    assert.deepEqual(await post('/password-reset/confirm', { username: 'guessed', code, newPassword: 'new-password' }), EXPIRED);
    await post('/password-reset', { username: 'late', email: 'late@example.com' });
    const lateCode = mail.code();
    await db.expire(late);
    assert.deepEqual(await post('/password-reset/verify', { username: 'late', code: lateCode }), EXPIRED);
    assert.deepEqual(await post('/password-reset/confirm', { username: 'late', code: lateCode, newPassword: 'new-password' }), EXPIRED);
    assert.deepEqual(await post('/password-reset/confirm', { username: 'nobody', code: lateCode, newPassword: 'new-password' }), EXPIRED);
    for (const id of [guessed, late]) assert.equal(await comparePassword('old-password', await db.passwordHash(id)), true);
  });
}
