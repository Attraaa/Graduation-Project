import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RecordRepository } from '../../database/sqlite/repository.ts';
import { EyeRecorder } from '../../database/eyeRecorder.ts';
import { emptyEyeTotals, parseEyeBatch, eyeRate } from '../../database/eye.ts';
import { createEyeMeasurement } from '../src/features/eye/measurement.ts';
import { sampleBatch } from './fixtures/record-batch.mjs';
import { historyView } from '../src/features/records/views.ts';

const start = Date.parse('2026-10-01T14:59:59.900Z');
const record = (id = 'eye') => ({ ...emptyEyeTotals(), id, owner: 'demo', mode: 'eye', startedAt: start, updatedAt: start, offsetMinutes: -540, policyVersion: 'eye-habits-v2', status: 'running' });
const sample = (validMs = 0, blinks = 0, nearReminder = false, openReminder = false) => ({ validMs, blinks, nearReminder, openReminder });
const query = { owner: 'demo', from: '2026-10-01', to: '2026-10-02' };
function measured(id) {
  const collector = new EyeRecorder(record(id), 0);
  collector.sample(0, sample()); collector.sample(200, sample(200, 1, true, true));
  collector.rest(20200, 1); collector.finish(20300);
  return collector.batch(0);
}
function fixture(t) { const dir = mkdtempSync(join(tmpdir(), 'moti-eye-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return join(dir, 'posture.sqlite'); }

test('eye minute boundaries, local midnight, reminder edges and declared breaks survive storage', t => {
  let db; t.after(() => db?.close()); db = new RecordRepository(fixture(t));
  const batch = measured(); db.writeEye(batch); db.writeEye(batch);
  const rows = db.eyeStatistics(query);
  assert.equal(rows[0].date, '2026-10-01'); assert.equal(rows[1].date, '2026-10-02');
  assert.equal(rows[0].validMs, 100); assert.equal(rows[1].validMs, 100);
  assert.equal(rows[0].blinks, 0); assert.equal(rows[1].blinks, 1);
  assert.equal(rows[1].breaks, 1); assert.equal(rows[1].nearReminders, 1);
  assert.equal(db.history(query).counts['2026-10-01'], 1);
  assert.equal(historyView(db.eyeDetail('demo', 'eye').record).mode, 'eye');
  assert.equal(db.integrity(), 'ok'); assert.equal(eyeRate({ blinks: 0, validMs: 0 }), null);
  assert.equal(eyeRate({ blinks: 0, validMs: 30000 }), 0);
});
test('strict eye contract and transaction reject invalid fields, ranges and totals without writes', t => {
  let db; t.after(() => db?.close()); db = new RecordRepository(fixture(t));
  for (const mutate of [b => b.image = 'private', b => b.record.validMs = Infinity, b => b.record.offsetMinutes = 841, b => b.record.status = ['running'],
    b => b.buckets[0].blinks = -1, b => b.buckets.push(b.buckets[0]), b => b.buckets[0].minute++]) {
    const b = measured(); mutate(b); assert.throws(() => parseEyeBatch(b));
  }
  const bad = measured(); bad.record.blinks++; assert.throws(() => db.writeEye(bad), /합계/);
  assert.throws(() => db.eyeDetail('demo', 'eye'), /찾을/);
  db.writeEye(measured()); assert.throws(() => db.eyeDetail('other', 'eye'));
  assert.throws(() => db.writeEye({ ...measured(), sequence: 2 }), /순서/);
  assert.throws(() => db.writeEye({ ...measured(), record: { ...measured().record, policyVersion: 'different' } }), /다른 기록/);
});
test('v2 migration preserves posture and keyboard, recovers eye running records, and clear invalidates late writes', t => {
  let db; t.after(() => db?.close()); const file = fixture(t); db = new RecordRepository(file);
  const posture = sampleBatch(); db.write(posture);
  const keyboard = { schemaVersion: 1, generation: 0, sequence: 0,
    record: { id: 'keyboard', owner: 'demo', startedAt: start, updatedAt: start, offsetMinutes: -540,
      status: 'running', policyVersion: 'keyboard-v1', recognitionVersion: 'hands-v1', nearbyCredit: 70, total: 0 }, counts: [] };
  db.writeKeyboard(keyboard); db.close();
  const old = new DatabaseSync(file);
  old.exec('DROP TABLE eye_batches; DROP TABLE eye_buckets; DROP TABLE eye_records; PRAGMA user_version=2'); old.close();
  db = new RecordRepository(file);
  assert.equal(db.detail('demo', posture.record.id).record.owner, 'demo');
  assert.equal(db.keyboardDetail('demo', 'keyboard').record.total, 0);
  const eye = measured(); eye.record.status = 'running'; db.writeEye(eye);
  const other = measured('other'); other.record.owner = 'other'; db.writeEye(other);
  db.close(); db = new RecordRepository(file);
  assert.equal(db.eyeDetail('demo', 'eye').record.status, 'interrupted');
  assert.equal(db.clear('demo'), 1); assert.equal(db.history(query).records.length, 0);
  assert.equal(db.eyeStatistics(query).length, 0); assert.throws(() => db.writeEye(eye), /삭제/);
  assert.equal(db.eyeDetail('other', 'other').record.blinks, 1); assert.equal(db.integrity(), 'ok');
});
test('mixed calendar orders and paginates eye and posture rows together, with full counts', t => {
  let db; t.after(() => db?.close()); db = new RecordRepository(fixture(t));
  const p = sampleBatch(); const date = new Date(p.record.startedAt - p.record.offsetMinutes * 60000).toISOString().slice(0, 10);
  for (let i = 0; i < 51; i++) {
    db.write({ ...p, record: { ...p.record, id: 'p-' + i } });
    const r = { ...record('e-' + i), startedAt: p.record.startedAt, updatedAt: p.record.startedAt, offsetMinutes: p.record.offsetMinutes };
    db.writeEye(new EyeRecorder(r, 0).batch(0));
  }
  const q = { owner: 'demo', from: date, to: date }, a = db.history(q), b = db.history({ ...q, offset: 100 });
  assert.equal(a.counts[date], 102); assert.equal(a.records.length, 100); assert.equal(a.hasMore, true);
  assert.equal(b.records.length, 2); assert.equal(b.hasMore, false);
  assert.equal(new Set([...a.records, ...b.records].map(r => r.mode + ':' + r.id)).size, 102);
});
test('real eye measurement totals survive calibration, missing frames, pause and recalibration', () => {
  const engine = createEyeMeasurement(), collector = new EyeRecorder(record(), 0);
  const observation = (closed = false) => ({ left: closed ? .8 : .1, right: closed ? .8 : .1, faceWidth: .2 });
  let at = 0, snapshot;
  const take = value => { snapshot = engine.sample(at, value); collector.sample(at, snapshot); at += 100; };
  for (let i = 0; i < 35; i++) take(observation());
  take(observation(true)); take(observation(true)); take(observation()); take(null);
  at += 20000; collector.rest(at, 1); take(null);
  collector.sample(at, engine.recalibrate());
  for (let i = 0; i < 35; i++) take(observation());
  take(observation(true)); take(observation());
  collector.finish(at);
  const batch = collector.batch(0);
  assert.equal(batch.record.blinks, snapshot.blinks); assert.equal(batch.record.blinks, 2);
  assert.ok(Math.abs(batch.record.validMs - snapshot.validMs) < .01); assert.equal(batch.record.breaks, 1);
  assert.ok(batch.record.validMs < batch.record.runMs - 20000); parseEyeBatch(batch);
});
test('long sessions drain bounded batches and preserve immutable retries and policy isolation', () => {
  const db = new RecordRepository(':memory:');
  try {
    const collector = new EyeRecorder(record(), 0);
    collector.sample(200, sample(200, 1, true)); const pending = collector.batch(0);
    collector.sample(300, sample(300, 1, true));
    collector.advance(181 * 60000); collector.finish(181 * 60000);
    assert.strictEqual(collector.batch(0), pending);
    let batches = 0;
    do { const batch = collector.batch(0); parseEyeBatch(batch); db.writeEye(batch); collector.acknowledge(); batches++; if (batch.record.status === 'finished') break; } while (batches < 10);
    assert.ok(batches >= 3);
    const detail = db.eyeDetail('demo', 'eye');
    assert.equal(detail.record.status, 'finished'); assert.equal(detail.record.nearReminders, 1);
    assert.equal(detail.record.validMs, 300); assert.equal(detail.record.runMs, 181 * 60000);
    const another = measured('other-policy'); another.record.policyVersion = 'future-policy'; db.writeEye(another);
    assert.deepEqual(new Set(db.eyeStatistics(query).map(r => r.policyVersion)), new Set(['eye-habits-v2', 'future-policy']));
  } finally { db.close(); }
});
