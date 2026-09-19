import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RecordRepository } from '../../database/sqlite/repository.ts';
import { sampleBatch } from './fixtures/record-batch.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'moti-db-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'records.sqlite');
}
function measured() {
  const batch = sampleBatch();
  Object.assign(batch.record, { updatedAt: batch.record.startedAt + 1000, runMs: 1000, validMs: 500, scoreTimeSum: 25000, longestContinuousMs: 500 });
  batch.buckets = [{ minute: batch.record.startedAt, runMs: 1000, validMs: 500, scoreTimeSum: 25000, deviationMs: 0, deviationEpisodeCount: 0 }];
  return batch;
}
test('real file survives restart, retries once and recovers incomplete sessions', t => {
  const file = fixture(t); let db = new RecordRepository(file);
  const batch = measured(); db.write(batch); db.write(batch);
  assert.equal(db.detail('demo', 'one').buckets.length, 1);
  assert.equal(db.integrity(), 'ok'); db.close(); db = new RecordRepository(file);
  assert.equal(db.detail('demo', 'one').record.status, 'interrupted');
  assert.equal(db.detail('demo', 'one').record.scoreTimeSum, 25000); db.close();
});
test('failed summary transaction rolls back both records and buckets', t => {
  const db = new RecordRepository(fixture(t)); const bad = measured(); bad.record.scoreTimeSum = 20000;
  assert.throws(() => db.write(bad), /합계/);
  assert.throws(() => db.detail('demo', 'one'), /찾을/);
  db.write(measured()); assert.equal(db.detail('demo', 'one').record.scoreTimeSum, 25000); db.close();
});
test('owner isolation, sequence conflicts and delete generation reject stale writes', t => {
  const db = new RecordRepository(fixture(t)); const batch = measured(); db.write(batch);
  assert.throws(() => db.detail('other', 'one'));
  assert.throws(() => db.write({ ...batch, record: { ...batch.record, status: 'finished' } }), /다른 기록/);
  assert.throws(() => db.write({ ...batch, sequence: 2 }), /순서/);
  const other = measured(); other.record.id = 'two'; other.record.owner = 'other'; db.write(other);
  assert.equal(db.clear('demo'), 1); assert.throws(() => db.write(batch), /삭제/);
  assert.equal(db.detail('other', 'two').record.owner, 'other'); assert.equal(db.integrity(), 'ok'); db.close();
});
test('busy writer fails without corrupting committed records and retry succeeds', t => {
  const file = fixture(t); const db = new RecordRepository(file); const lock = new DatabaseSync(file);
  lock.exec('BEGIN IMMEDIATE'); assert.throws(() => db.write(measured()), /locked/); lock.exec('ROLLBACK'); lock.close();
  db.write(measured()); assert.equal(db.integrity(), 'ok'); db.close();
});
test('read-only, foreign, future and corrupt databases are preserved', t => {
  const file = fixture(t); let db = new RecordRepository(file); db.write(measured()); db.close();
  db = new RecordRepository(file, { readOnly: true }); assert.throws(() => db.clear('demo')); db.close();
  const future = new DatabaseSync(file); future.exec('PRAGMA user_version=99'); future.close();
  const before = readFileSync(file); assert.throws(() => new RecordRepository(file), /버전/); assert.deepEqual(readFileSync(file), before);
  const corrupt = file + '.corrupt'; writeFileSync(corrupt, 'do not overwrite');
  assert.throws(() => new RecordRepository(corrupt)); assert.equal(readFileSync(corrupt, 'utf8'), 'do not overwrite');
});

test('foreign version-zero database is never initialized over existing tables', t => {
  const file = fixture(t); const foreign = new DatabaseSync(file);
  foreign.exec("CREATE TABLE unrelated(value TEXT); INSERT INTO unrelated VALUES('preserve')"); foreign.close();
  const before = readFileSync(file); assert.throws(() => new RecordRepository(file), /다른 데이터베이스/);
  assert.deepEqual(readFileSync(file), before);
});
test('calendar counts cover every record while day pages remain bounded and stable', t => {
  const db = new RecordRepository(fixture(t));
  for (let index = 0; index < 102; index++) { const batch = measured(); batch.record.id = 'page-' + index; db.write(batch); }
  const date = new Date(measured().record.startedAt + 540 * 60000).toISOString().slice(0, 10);
  const query = { owner: 'demo', from: date, to: date };
  const first = db.list(query), second = db.list({ ...query, offset: 100 });
  assert.equal(first.records.length, 100); assert.equal(first.hasMore, true); assert.equal(first.counts[date], 102);
  assert.equal(second.records.length, 2); assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.records, ...second.records].map(record => record.id)).size, 102); db.close();
});