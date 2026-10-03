import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRecords } from './fixtures/memory-records.mjs';
import { EyeRecorder } from '../../database/eyeRecorder.ts';
import { emptyEyeTotals, parseEyeBatch, eyeRate } from '../../database/eye.ts';
import { createEyeMeasurement } from '../src/features/eye/measurement.ts';
import { sampleBatch } from './fixtures/record-batch.mjs';
import { historyView } from '../src/features/records/views.ts';

const start = Date.parse('2026-10-01T14:59:59.900Z');
const record = (id = 'eye') => ({ ...emptyEyeTotals(), id, owner: '7', mode: 'eye', startedAt: start, updatedAt: start, offsetMinutes: -540, policyVersion: 'eye-habits-v2', status: 'running' });
const sample = (validMs = 0, blinks = 0, nearReminder = false, openReminder = false) => ({ validMs, blinks, nearReminder, openReminder });
const query = { owner: '7', from: '2026-10-01', to: '2026-10-02' };
function measured(id) {
  const collector = new EyeRecorder(record(id), 0);
  collector.sample(0, sample()); collector.sample(200, sample(200, 1, true, true));
  collector.rest(20200, 1); collector.finish(20300);
  return collector.batch(0);
}
test('eye minute boundaries, local midnight, reminder edges and declared breaks form server aggregates', () => {
  const db = new MemoryRecords();
  const batch = measured(); db.writeEye(batch); db.writeEye(batch);
  const rows = db.eyeStatistics(query);
  assert.equal(rows[0].date, '2026-10-01'); assert.equal(rows[1].date, '2026-10-02');
  assert.equal(rows[0].validMs, 100); assert.equal(rows[1].validMs, 100);
  assert.equal(rows[0].blinks, 0); assert.equal(rows[1].blinks, 1);
  assert.equal(rows[1].breaks, 1); assert.equal(rows[1].nearReminders, 1);
  assert.equal(db.history(query).counts['2026-10-01'], 1);
  assert.equal(historyView(db.eyeDetail('7', 'eye').record).mode, 'eye');
  assert.equal(eyeRate({ blinks: 0, validMs: 0 }), null);
  assert.equal(eyeRate({ blinks: 0, validMs: 30000 }), 0);
});
test('strict eye contract and client acceptance reject invalid fields, ranges and totals without writes', () => {
  const db = new MemoryRecords();
  for (const mutate of [b => b.image = 'private', b => b.record.validMs = Infinity, b => b.record.offsetMinutes = 841, b => b.record.status = ['running'],
    b => b.buckets[0].blinks = -1, b => b.buckets.push(b.buckets[0]), b => b.buckets[0].minute++]) {
    const b = measured(); mutate(b); assert.throws(() => parseEyeBatch(b));
  }
  const bad = measured(); bad.record.blinks++; assert.throws(() => db.writeEye(bad), /합계/);
  assert.throws(() => db.eyeDetail('7', 'eye'), /찾을/);
  db.writeEye(measured()); assert.throws(() => db.eyeDetail('8', 'eye'));
  assert.throws(() => db.writeEye({ ...measured(), sequence: 2 }), /순서/);
  assert.throws(() => db.writeEye({ ...measured(), record: { ...measured().record, policyVersion: 'different' } }), /다른 기록/);
});
test('eye client batches preserve fixed policy, cumulative totals and bucket values across sequences', () => {
  const db = new MemoryRecords(), first = measured(); first.record.status = 'running'; db.writeEye(first);
  const saved = db.eyeDetail('7', 'eye');
  const next = () => ({ ...structuredClone(first), sequence: 1 });
  const policy = next(); policy.record.policyVersion = 'other'; assert.throws(() => db.writeEye(policy), /고정 정보/);
  const lower = next(); lower.record.blinks--; assert.throws(() => db.writeEye(lower), /누적값/);
  const bucket = next(); bucket.buckets.at(-1).blinks--; assert.throws(() => db.writeEye(bucket), /버킷 누적값/);
  assert.deepEqual(db.eyeDetail('7', 'eye'), saved);
  const other = next(); other.record.owner = '8'; assert.throws(() => db.writeEye(other), /다른 계정/);
  const finished = next(); finished.record.status = 'finished'; db.writeEye(finished); db.writeEye(finished);
  assert.throws(() => db.writeEye({ ...finished, sequence: 2 }), /이미 종료/);
  assert.equal(db.eyeDetail('7', 'eye').record.status, 'finished');
});
test('owner deletion clears eye and companion records and invalidates late writes without affecting other users', () => {
  const db = new MemoryRecords();
  const posture = sampleBatch(); posture.record.owner = '7'; db.write(posture);
  const keyboard = { schemaVersion: 1, generation: 0, sequence: 0,
    record: { id: 'keyboard', owner: '7', startedAt: start, updatedAt: start, offsetMinutes: -540,
      status: 'running', policyVersion: 'keyboard-v1', recognitionVersion: 'hands-v1', nearbyCredit: 70, total: 0 }, counts: [] };
  db.writeKeyboard(keyboard);
  assert.equal(db.detail('7', posture.record.id).record.owner, '7');
  assert.equal(db.keyboardDetail('7', 'keyboard').record.total, 0);
  const eye = measured(); eye.record.status = 'running'; db.writeEye(eye);
  const other = measured('8'); other.record.owner = '8'; db.writeEye(other);
  assert.equal(db.clear('7'), 1); assert.equal(db.history(query).records.length, 0);
  assert.equal(db.eyeStatistics(query).length, 0); assert.throws(() => db.writeEye(eye), /삭제/);
  assert.throws(() => db.detail('7', posture.record.id), /찾을/);
  assert.throws(() => db.keyboardDetail('7', 'keyboard'), /찾을/);
  assert.equal(db.eyeDetail('8', '8').record.blinks, 1);
});
test('mixed calendar orders and paginates eye and posture rows together, with full counts', () => {
  const db = new MemoryRecords();
  const p = sampleBatch(); p.record.owner = '7'; const date = new Date(p.record.startedAt - p.record.offsetMinutes * 60000).toISOString().slice(0, 10);
  for (let i = 0; i < 51; i++) {
    db.write({ ...p, record: { ...p.record, id: 'a-p-' + i } });
    const r = { ...record('z-e-' + i), startedAt: p.record.startedAt, updatedAt: p.record.startedAt, offsetMinutes: p.record.offsetMinutes };
    db.writeEye(new EyeRecorder(r, 0).batch(0));
  }
  const q = { owner: '7', from: date, to: date }, a = db.history(q), b = db.history({ ...q, offset: 100 });
  assert.equal(a.counts[date], 102); assert.equal(a.records.length, 100); assert.equal(a.hasMore, true);
  assert.equal(b.records.length, 2); assert.equal(b.hasMore, false);
  assert.equal(new Set([...a.records, ...b.records].map(r => r.mode + ':' + r.id)).size, 102);
  assert.equal(a.records[0].mode, 'eye'); assert.equal(a.records[50].mode, 'eye'); assert.equal(a.records[51].mode, 'turtle');
  assert.throws(() => db.history({ ...q, mode: 'turtle' }), /모드 조건/);
  assert.throws(() => db.eyeStatistics({ ...q, mode: 'turtle' }), /모드 조건/);
  assert.equal(db.history({ ...q, owner: '8' }).records.length, 0);
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
  const db = new MemoryRecords();
  const collector = new EyeRecorder(record(), 0);
  collector.sample(200, sample(200, 1, true)); const pending = collector.batch(0);
  collector.sample(300, sample(300, 1, true));
  collector.advance(181 * 60000); collector.finish(181 * 60000);
  assert.strictEqual(collector.batch(0), pending);
  let batches = 0;
  do { const batch = collector.batch(0); parseEyeBatch(batch); db.writeEye(batch); collector.acknowledge(); batches++; if (batch.record.status === 'finished') break; } while (batches < 10);
  assert.ok(batches >= 3);
  const detail = db.eyeDetail('7', 'eye');
  assert.equal(detail.record.status, 'finished'); assert.equal(detail.record.nearReminders, 1);
  assert.equal(detail.record.validMs, 300); assert.equal(detail.record.runMs, 181 * 60000);
  const another = measured('other-policy'); another.record.policyVersion = 'future-policy'; db.writeEye(another);
  assert.deepEqual(new Set(db.eyeStatistics(query).map(r => r.policyVersion)), new Set(['eye-habits-v2', 'future-policy']));
});
