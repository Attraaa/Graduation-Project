import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import mysql from 'mysql2/promise';
import { MysqlRecordRepository } from '../src/repositories/records.js';
import { emptyTotals, AGGREGATION_VERSION } from '../../database/contracts.ts';
import type { RecordBatch } from '../../database/contracts.ts';
import type { KeyboardBatch } from '../../database/keyboard.ts';
import { CaptureRecorder } from '../../database/recorder.ts';
import { summarizeStatistics, scoreDifference } from '../../database/aggregation.ts';

/**
 * Runs the real SQL against MySQL only when MOTI_TEST_MYSQL_URL names a server account that may
 * create databases (for example mysql://root:password@127.0.0.1:3306). Each run creates and then
 * drops its own uniquely named database; it never selects or modifies an existing one.
 */
const url = process.env.MOTI_TEST_MYSQL_URL;
const DEMO = 1, OTHER = 2;

async function database(t: test.TestContext) {
  const name = `moti_records_test_${randomBytes(6).toString('hex')}`;
  const admin = await mysql.createConnection({ uri: url, multipleStatements: true });
  await admin.query(`CREATE DATABASE \`${name}\``);
  t.after(async () => { await admin.query(`DROP DATABASE \`${name}\``); await admin.end(); });
  await admin.query(`USE \`${name}\``);
  await admin.query(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  await admin.query("INSERT INTO users (id, username, nickname, password_hash) VALUES (1, 'demo', 'demo', 'x'), (2, 'other', 'other', 'x')");
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
});
