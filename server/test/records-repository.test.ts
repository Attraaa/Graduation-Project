import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import mysql from 'mysql2/promise';
import type { Pool } from 'mysql2/promise';
import { MysqlRecordRepository } from '../src/repositories/records.js';
import { emptyTotals, AGGREGATION_VERSION } from '../../database/contracts.ts';
import type { RecordBatch } from '../../database/contracts.ts';
import type { KeyboardBatch } from '../../database/keyboard.ts';
import { CaptureRecorder } from '../../database/recorder.ts';
import { summarizeStatistics, scoreDifference } from '../../database/aggregation.ts';
import { emptyEyeTotals } from '../../database/eye.ts';
import type { EyeBatch } from '../../database/eye.ts';
import { EyeRecorder } from '../../database/eyeRecorder.ts';

/**
 * Runs the real SQL against MySQL only when MOTI_TEST_MYSQL_URL names a server account that may
 * create databases (for example mysql://root:password@127.0.0.1:3306). Each run creates and then
 * drops its own uniquely named database; it never selects or modifies an existing one.
 */
const url = process.env.MOTI_TEST_MYSQL_URL;
const DEMO = 1, OTHER = 2;

async function database(t: test.TestContext, migrateEye = false) {
  const name = `moti_records_test_${randomBytes(6).toString('hex')}`;
  const admin = await mysql.createConnection({ uri: url, multipleStatements: true });
  await admin.query(`CREATE DATABASE \`${name}\``);
  t.after(async () => { await admin.query(`DROP DATABASE \`${name}\``); await admin.end(); });
  await admin.query(`USE \`${name}\``);
  const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  await admin.query(migrateEye ? schema.split('-- 14~16.')[0] : schema);
  await admin.query("INSERT INTO users (id, username, nickname, password_hash) VALUES (1, 'demo', 'demo', 'x'), (2, 'other', 'other', 'x')");
  if (migrateEye) {
    const value = measured('before-migration');
    await admin.query(`INSERT INTO posture_records (id, user_id, mode, start_date, started_at, score_policy, habit_policy, longest_ms, sequence, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [value.record.id, DEMO, 'turtle', '2027-01-15', value.record.startedAt,
      value.record.scorePolicyVersion, value.record.habitPolicyVersion, value.record.longestContinuousMs, 0, JSON.stringify(value.record)]);
    await admin.query(readFileSync(new URL('../migrations/003_eye_records.sql', import.meta.url), 'utf8'));
  }
  const pool = mysql.createPool({ uri: url, database: name, connectionLimit: 4, timezone: '+09:00' });
  t.after(() => pool.end());
  return new MysqlRecordRepository(pool);
}

function measured(id = 'one', owner = String(DEMO)): RecordBatch {
  const startedAt = 1800000000000;
  return { schemaVersion: 1, aggregationPolicyVersion: AGGREGATION_VERSION, generation: 0, sequence: 0,
    record: { ...emptyTotals(), id, owner, mode: 'turtle', startedAt, updatedAt: startedAt + 1000, offsetMinutes: -540,
      runMs: 1000, validMs: 500, scoreTimeSum: 25000, scorePolicyVersion: 'turtle-v1', habitPolicyVersion: 'habit-v1', longestContinuousMs: 500, status: 'running' },
    buckets: [{ minute: startedAt, runMs: 1000, validMs: 500, scoreTimeSum: 25000, deviationMs: 0, deviationEpisodeCount: 0 }] };
}
function keyboard(): KeyboardBatch {
  const startedAt = Date.parse('2026-10-01T00:00:00Z');
  return { schemaVersion: 1, generation: 0, sequence: 0,
    record: { id: 'keyboard-one', owner: String(DEMO), startedAt, updatedAt: startedAt + 1000, offsetMinutes: -540,
      status: 'running', policyVersion: 'ansi-qwerty-touch:2.0.0', recognitionVersion: 'hands-label-distance-v2', nearbyCredit: 70, total: 10 },
    counts: [{ date: '2026-10-01', code: 'KeyA', context: 'plain', finger: 'left:pinky', verdict: 'preferred', reason: 'preferred-finger', count: 8 },
      { date: '2026-10-01', code: 'KeyA', context: 'plain', finger: 'left:ring', verdict: 'nearby', reason: 'neighboring-finger', count: 2 }] };
}
function measuredEye(id = 'eye-one', owner = String(DEMO)): EyeBatch {
  const startedAt = 1800000000000;
  return { schemaVersion: 1, generation: 0, sequence: 0,
    record: { ...emptyEyeTotals(), id, owner, mode: 'eye', startedAt, updatedAt: startedAt + 1000,
      offsetMinutes: -540, policyVersion: 'eye-habits-v2', status: 'running', runMs: 1000, validMs: 500, blinks: 2 },
    buckets: [{ minute: startedAt, ...emptyEyeTotals(), runMs: 1000, validMs: 500, blinks: 2 }] };
}
async function capture(db: MysqlRecordRepository, id: string, start: number, duration: number, score: number | null,
  mode: 'turtle' | 'shoulder' = 'turtle', version = 'v1', userId = DEMO) {
  const recorder = new CaptureRecorder({ ...measured().record, ...emptyTotals(), id, owner: String(userId), mode, scorePolicyVersion: version,
    startedAt: start, updatedAt: start, offsetMinutes: 0, longestContinuousMs: 0 }, 0);
  for (let at = 0; at <= duration; at += 500) recorder.sample(at, {
    validMs: score === null ? 0 : at, scoreTimeSum: score === null ? 0 : at * score, currentScore: score, deviationMs: 0, deviationEpisodeCount: 0,
  });
  recorder.finish(duration);
  await db.write(userId, recorder.batch(0)!);
}
const rejects = (promise: Promise<unknown>, pattern: RegExp, status = 409) =>
  assert.rejects(promise, (error: Error & { status?: number }) => pattern.test(error.message) && error.status === status);

test('MySQL record repository', { skip: url ? false : 'set MOTI_TEST_MYSQL_URL to run against a temporary MySQL database' }, async t => {
  await t.test('retries apply once and a failed summary rolls back records and buckets', async t => {
    const db = await database(t);
    const bad = measured(); bad.record.scoreTimeSum = 20000;
    await rejects(db.write(DEMO, bad), /합계/);
    await rejects(db.detail(DEMO, 'one'), /찾을/, 404);
    const batch = measured();
    await db.write(DEMO, batch); await db.write(DEMO, batch);
    const detail = await db.detail(DEMO, 'one');
    assert.equal(detail.buckets.length, 1);
    assert.deepEqual(detail.record, batch.record);
    assert.deepEqual(detail.buckets, batch.buckets);
  });

  await t.test('owner isolation, sequence conflicts and delete generation reject stale writes', async t => {
    const db = await database(t);
    const batch = measured(); await db.write(DEMO, batch);
    await rejects(db.detail(OTHER, 'one'), /찾을/, 404);
    await rejects(db.write(OTHER, batch), /다른 계정/);
    await rejects(db.write(DEMO, { ...batch, record: { ...batch.record, status: 'finished' } }), /다른 기록/);
    await rejects(db.write(DEMO, { ...batch, sequence: 2 }), /순서/);
    const next = structuredClone(batch); next.sequence = 1; next.record.runMs = 900; next.record.updatedAt -= 100;
    next.buckets[0].runMs = 900;
    await rejects(db.write(DEMO, next), /감소/);
    await db.write(OTHER, measured('two', String(OTHER)));
    assert.equal(await db.clear(DEMO), 1);
    assert.equal(await db.generation(DEMO), 1);
    await rejects(db.write(DEMO, batch), /삭제/);
    await db.write(DEMO, { ...measured('three'), generation: 1 });
    assert.equal((await db.detail(OTHER, 'two')).record.owner, String(OTHER));
  });

  await t.test('concurrent first writes for one user serialize without losing either record', async t => {
    const db = await database(t);
    await Promise.all(['a', 'b', 'c', 'd'].map(id => db.write(DEMO, measured(id))));
    const date = new Date(measured().record.startedAt + 540 * 60000).toISOString().slice(0, 10);
    assert.equal((await db.list(DEMO, { owner: String(DEMO), from: date, to: date })).counts[date], 4);
  });

  await t.test('calendar counts cover every record while day pages remain bounded and stable', async t => {
    const db = await database(t);
    for (let index = 0; index < 102; index++) await db.write(DEMO, measured('page-' + index));
    const date = new Date(measured().record.startedAt + 540 * 60000).toISOString().slice(0, 10);
    const query = { owner: String(DEMO), from: date, to: date };
    const first = await db.list(DEMO, query), second = await db.list(DEMO, { ...query, offset: 100 });
    assert.equal(first.records.length, 100); assert.equal(first.hasMore, true); assert.equal(first.counts[date], 102);
    assert.equal(second.records.length, 2); assert.equal(second.hasMore, false);
    assert.equal(new Set([...first.records, ...second.records].map(record => record.id)).size, 102);
  });

  await t.test('time-weighted averages preserve measured zero and separate policies, modes and users', async t => {
    const db = await database(t); const start = Date.parse('2026-09-19T10:00:00Z');
    await capture(db, 'long', start, 9000, 100); await capture(db, 'zero', start, 1000, 0); await capture(db, 'missing', start, 1000, null);
    await capture(db, 'shoulder', start, 1000, 20, 'shoulder'); await capture(db, 'newversion', start, 1000, 10, 'turtle', 'v2');
    await capture(db, 'other', start, 1000, 10, 'turtle', 'v1', OTHER);
    const groups = summarizeStatistics(await db.statistics(DEMO, { owner: String(DEMO), from: '2026-09-19', to: '2026-09-19' }));
    assert.equal(groups.length, 3);
    const group = groups.find(row => row.mode === 'turtle' && row.scorePolicyVersion === 'v1')!;
    assert.equal(group.average, 90); assert.equal(group.sessionCount, 3); assert.equal(group.unknownMs, 1000);
    assert.equal(scoreDifference(group, groups.find(row => row.mode === 'shoulder')), null);
    assert.equal((await db.statistics(DEMO, { owner: String(DEMO), from: '2026-09-19', to: '2026-09-19', mode: 'shoulder' })).length, 1);
  });

  await t.test('cross-midnight observations belong to actual days, history remains on start day', async t => {
    const db = await database(t); await capture(db, 'midnight', Date.parse('2026-12-31T23:59:59Z'), 2000, 50);
    const rows = await db.statistics(DEMO, { owner: String(DEMO), from: '2026-12-31', to: '2027-01-01' });
    assert.equal(rows.length, 2); assert.equal(rows[0].validMs, 1000); assert.equal(rows[1].validMs, 1000);
    assert.equal(summarizeStatistics(rows)[0].sessionCount, 1);
    assert.equal((await db.list(DEMO, { owner: String(DEMO), from: '2027-01-01', to: '2027-01-01' })).records.length, 0);
    assert.equal((await db.list(DEMO, { owner: String(DEMO), from: '2026-12-31', to: '2026-12-31' })).counts['2026-12-31'], 1);
  });

  await t.test('keyboard aggregates retry once, never decrease, stay per user and are cleared with the user', async t => {
    const db = await database(t);
    const posture = measured(); await db.write(DEMO, posture);
    const value = keyboard(); await db.writeKeyboard(DEMO, value); await db.writeKeyboard(DEMO, value);
    assert.deepEqual(await db.keyboardDetail(DEMO, value.record.id), { record: value.record, counts: value.counts });
    await rejects(db.keyboardDetail(OTHER, value.record.id), /찾을/, 404);
    await rejects(db.writeKeyboard(DEMO, { ...value, record: { ...value.record, total: 9 } }), /다른 기록/);
    const next = structuredClone(value); next.sequence++; next.counts[0].count++; next.record.total++; await db.writeKeyboard(DEMO, next);
    const bad = structuredClone(next); bad.sequence++; bad.counts[0].count--; bad.counts[1].count++;
    await rejects(db.writeKeyboard(DEMO, bad), /누적값/);
    assert.equal((await db.keyboardDetail(DEMO, value.record.id)).record.total, 11);
    const different = structuredClone(value); different.record.owner = String(OTHER); different.record.id = 'other';
    await db.writeKeyboard(OTHER, different);
    assert.equal((await db.keyboardStatistics(DEMO, { owner: String(DEMO), from: '2026-10-01', to: '2026-10-01' })).length, 1);
    assert.equal((await db.keyboardStatistics(DEMO, { owner: String(DEMO), from: '2026-10-02', to: '2026-10-02' })).length, 0);
    assert.equal(await db.clear(DEMO), 1);
    await rejects(db.writeKeyboard(DEMO, value), /삭제/);
    await rejects(db.detail(DEMO, posture.record.id), /찾을/, 404);
    await rejects(db.keyboardDetail(DEMO, value.record.id), /찾을/, 404);
    assert.equal((await db.keyboardDetail(OTHER, 'other')).record.total, 10);
  });

  await t.test('eye retries, rollback, owner isolation, immutable policy and delete generation', async t => {
    const db = await database(t), value = measuredEye();
    const inconsistent = structuredClone(value); inconsistent.record.blinks++;
    await rejects(db.writeEye(DEMO, inconsistent), /합계/);
    await rejects(db.eyeDetail(DEMO, value.record.id), /찾을/, 404);
    await db.writeEye(DEMO, value); await db.writeEye(DEMO, value);
    assert.deepEqual(await db.eyeDetail(DEMO, value.record.id), { record: value.record, buckets: value.buckets });
    await rejects(db.eyeDetail(OTHER, value.record.id), /찾을/, 404);
    await rejects(db.writeEye(OTHER, value), /다른 계정/);
    const conflict = structuredClone(value); conflict.record.blinks++; conflict.buckets[0].blinks++;
    await rejects(db.writeEye(DEMO, conflict), /다른 기록/);
    await rejects(db.writeEye(DEMO, { ...value, sequence: 2 }), /순서/);
    const next = structuredClone(value); next.sequence++; next.record.policyVersion = 'other-version';
    await rejects(db.writeEye(DEMO, next), /고정 정보/);
    next.record.policyVersion = value.record.policyVersion; next.record.validMs--; next.buckets[0].validMs--;
    await rejects(db.writeEye(DEMO, next), /누적값/);
    const finished = structuredClone(value); finished.sequence++; finished.record.status = 'finished';
    await db.writeEye(DEMO, finished);
    await rejects(db.writeEye(DEMO, { ...finished, sequence: 2 }), /종료/);
    await db.writeEye(OTHER, measuredEye('other-eye', String(OTHER)));
    assert.equal(await db.clear(DEMO), 1);
    await rejects(db.eyeDetail(DEMO, value.record.id), /찾을/, 404);
    await rejects(db.writeEye(DEMO, measuredEye('stale-eye')), /삭제/);
    assert.equal((await db.eyeDetail(OTHER, 'other-eye')).record.blinks, 2);
    await db.writeEye(DEMO, { ...measuredEye('fresh-eye'), generation: 1 });
  });

  await t.test('eye observation buckets cross midnight and separate policies and owners', async t => {
    const db = await database(t);
    const record = { ...measuredEye().record, ...emptyEyeTotals(), startedAt: Date.parse('2026-12-31T23:59:59Z'),
      updatedAt: Date.parse('2026-12-31T23:59:59Z'), offsetMinutes: 0 };
    const collector = new EyeRecorder(record, 0);
    collector.sample(0, { validMs: 0, blinks: 0, nearReminder: false, openReminder: false });
    collector.sample(1000, { validMs: 1000, blinks: 1, nearReminder: true, openReminder: false });
    collector.sample(2000, { validMs: 2000, blinks: 2, nearReminder: true, openReminder: true });
    collector.rest(2000, 1); collector.finish(2000);
    await db.writeEye(DEMO, collector.batch(0)!);
    const rows = await db.eyeStatistics(DEMO, { owner: String(DEMO), from: '2026-12-31', to: '2027-01-01' });
    assert.equal(rows.length, 2); assert.equal(rows[0].validMs, 1000); assert.equal(rows[1].validMs, 1000);
    assert.equal(rows[1].blinks, 2); assert.equal(rows[1].nearReminders, 1); assert.equal(rows[1].openReminders, 1); assert.equal(rows[1].breaks, 1);
    assert.equal((await db.history(DEMO, { owner: String(DEMO), from: '2027-01-01', to: '2027-01-01' })).records.length, 0);
    const second = collector.batch(0)!;
    second.record = { ...second.record, id: 'second', policyVersion: 'eye-habits-v3' };
    await db.writeEye(DEMO, second);
    const other = structuredClone(second); other.record = { ...other.record, id: 'foreign', owner: String(OTHER) };
    await db.writeEye(OTHER, other);
    const separated = await db.eyeStatistics(DEMO, { owner: String(DEMO), from: '2027-01-01', to: '2027-01-01' });
    assert.equal(separated.length, 2); assert.equal(separated[0].sessionCount, 1); assert.equal(separated[1].sessionCount, 1);
  });

  await t.test('mixed history pages include all posture and eye counts with stable ordering', async t => {
    const db = await database(t);
    for (let index = 0; index < 102; index++) {
      if (index % 2) await db.writeEye(DEMO, measuredEye('page-' + index));
      else await db.write(DEMO, measured('page-' + index));
    }
    await db.writeEye(OTHER, measuredEye('foreign', String(OTHER)));
    const date = new Date(measuredEye().record.startedAt + 540 * 60000).toISOString().slice(0, 10);
    const query = { owner: String(DEMO), from: date, to: date };
    const first = await db.history(DEMO, query), second = await db.history(DEMO, { ...query, offset: 100 });
    assert.equal(first.records.length, 100); assert.equal(first.hasMore, true); assert.equal(first.counts[date], 102);
    assert.equal(second.records.length, 2); assert.equal(second.hasMore, false);
    assert.equal(new Set([...first.records, ...second.records].map(record => record.id)).size, 102);
    assert.equal(first.records.filter(record => record.mode === 'eye').length, 51);
  });

  await t.test('003 adds eye storage while preserving existing posture rows', async t => {
    const db = await database(t, true);
    assert.deepEqual((await db.detail(DEMO, 'before-migration')).record, measured('before-migration').record);
    const value = measuredEye(); await db.writeEye(DEMO, value);
    assert.deepEqual((await db.eyeDetail(DEMO, value.record.id)).record, value.record);
  });
});

type QueryStep = { sql: RegExp; rows?: unknown[]; values?: unknown[] };
function scriptedStore(steps: QueryStep[]) {
  const events: string[] = [];
  const query = async (sql: string, values: unknown[]) => {
    const next = steps.shift(); assert.ok(next, `unexpected query: ${sql}`);
    assert.match(sql.replace(/\s+/g, ' '), next.sql);
    if (next.values) assert.deepEqual(values, next.values);
    return [next.rows ?? [], []];
  };
  const connection = { query, beginTransaction: async () => { events.push('begin'); }, commit: async () => { events.push('commit'); },
    rollback: async () => { events.push('rollback'); }, release: () => { events.push('release'); } };
  return { db: new MysqlRecordRepository({ query, getConnection: async () => connection } as unknown as Pool), events,
    done: () => assert.equal(steps.length, 0) };
}
const eyeSqlTotals = (value: EyeBatch['record']) => ({ run_ms: String(value.runMs), valid_ms: String(value.validMs), blinks: String(value.blinks),
  breaks: String(value.breaks), near_reminders: String(value.nearReminders), open_reminders: String(value.openReminders) });
const eyeWriteSteps = (value: EyeBatch, sums = eyeSqlTotals(value.record)): QueryStep[] => [
  { sql: /INSERT INTO record_owners/, values: [DEMO] }, { sql: /SELECT generation.*FOR UPDATE/, rows: [{ generation: 0 }], values: [DEMO] },
  { sql: /SELECT user_id, sequence, data FROM eye_records.*FOR UPDATE/, values: [value.record.id] },
  { sql: /SELECT digest FROM eye_batches/, values: [value.record.id, 0] },
  { sql: /INSERT INTO eye_records/ }, { sql: /SELECT \* FROM eye_buckets.*FOR UPDATE/ },
  { sql: /INSERT INTO eye_buckets/ }, { sql: /SELECT COALESCE\(SUM\(run_ms\)/, rows: [sums] },
];

test('eye MySQL transaction converts numeric totals and commits its digest after the summary check', async () => {
  const value = measuredEye();
  const store = scriptedStore([...eyeWriteSteps(value), { sql: /INSERT INTO eye_batches/, values: [value.record.id, 0,
    createHash('sha256').update(JSON.stringify(value)).digest('hex')] }]);
  await store.db.writeEye(DEMO, value);
  store.done(); assert.deepEqual(store.events, ['begin', 'commit', 'release']);
});

test('eye MySQL summary mismatch rolls back without committing a retry digest', async () => {
  const value = measuredEye();
  const store = scriptedStore(eyeWriteSteps(value, { ...eyeSqlTotals(value.record), blinks: '1' }));
  await rejects(store.db.writeEye(DEMO, value), /합계/);
  store.done(); assert.deepEqual(store.events, ['begin', 'rollback', 'release']);
});

test('eye MySQL duplicate digest returns before mutating records or buckets', async () => {
  const value = measuredEye();
  const store = scriptedStore([
    { sql: /INSERT INTO record_owners/ }, { sql: /SELECT generation.*FOR UPDATE/, rows: [{ generation: 0 }] },
    { sql: /SELECT user_id, sequence, data FROM eye_records/, rows: [{ user_id: DEMO, sequence: 0, data: JSON.stringify(value.record) }] },
    { sql: /SELECT digest FROM eye_batches/, rows: [{ digest: createHash('sha256').update(JSON.stringify(value)).digest('hex') }] },
  ]);
  await store.db.writeEye(DEMO, value);
  store.done(); assert.deepEqual(store.events, ['begin', 'commit', 'release']);
});

test('eye and mixed-history MySQL reads use authorized owner and preserve typed numeric fields', async () => {
  const value = measuredEye(), posture = measured(), range = { owner: String(DEMO), from: '2026-10-01', to: '2026-10-03' };
  const store = scriptedStore([
    { sql: /SELECT data FROM eye_records WHERE user_id = \? AND id = \?/, values: [DEMO, value.record.id], rows: [{ data: JSON.stringify(value.record) }] },
    { sql: /SELECT \* FROM eye_buckets WHERE record_id = \? ORDER BY minute/, values: [value.record.id],
      rows: [{ minute: String(value.buckets[0].minute), ...eyeSqlTotals(value.record) }] },
    { sql: /COUNT\(DISTINCT r.id\).*GROUP BY b.date, b.hour, r.policy_version/, values: [DEMO, range.from, range.to],
      rows: [{ date: '2026-10-01', hour: '09', policy_version: value.record.policyVersion, session_count: '1', ...eyeSqlTotals(value.record) }] },
    { sql: /UNION ALL.*ORDER BY started_at DESC, mode, id LIMIT 101 OFFSET \?/, values: [DEMO, range.from, range.to, 100],
      rows: [{ mode: 'eye', data: JSON.stringify(value.record) }, { mode: 'turtle', data: JSON.stringify(posture.record) }] },
    { sql: /COUNT\(\*\).*UNION ALL.*GROUP BY start_date/, values: [DEMO, range.from, range.to], rows: [{ start_date: '2026-10-01', count: '102' }] },
  ]);
  assert.deepEqual(await store.db.eyeDetail(DEMO, value.record.id), { record: value.record, buckets: value.buckets });
  assert.deepEqual(await store.db.eyeStatistics(DEMO, range), [{ date: '2026-10-01', hour: '09', policyVersion: value.record.policyVersion,
    sessionCount: 1, runMs: 1000, validMs: 500, blinks: 2, breaks: 0, nearReminders: 0, openReminders: 0 }]);
  assert.deepEqual(await store.db.history(DEMO, { ...range, offset: 100 }), { records: [value.record, posture.record], hasMore: false, counts: { '2026-10-01': 102 } });
  store.done();
});
