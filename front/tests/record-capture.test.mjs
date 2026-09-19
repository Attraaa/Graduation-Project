import test from 'node:test';
import assert from 'node:assert/strict';
import { CaptureRecorder } from '../../database/recorder.ts';
import { RecordRepository } from '../../database/sqlite/repository.ts';
import { sampleBatch } from './fixtures/record-batch.mjs';
const evaluation = (validMs, scoreTimeSum, currentScore, deviationMs = 0, deviationEpisodeCount = 0) => ({ validMs, scoreTimeSum, currentScore, deviationMs, deviationEpisodeCount });
function create(epoch = Date.parse('2026-09-19T23:59:59.750Z')) {
  return new CaptureRecorder({ ...sampleBatch().record, startedAt: epoch, updatedAt: epoch, offsetMinutes: 0 }, 0);
}
test('minute and midnight split conserves the trapezoid', () => {
  const capture = create(); capture.sample(0, evaluation(0, 0, 0)); capture.sample(500, evaluation(500, 25000, 100)); capture.finish(1000);
  const batch = capture.batch(0);
  assert.equal(batch.record.validMs, 500); assert.equal(batch.record.scoreTimeSum, 25000);
  assert.equal(batch.buckets[0].scoreTimeSum / batch.buckets[0].validMs, 25);
  assert.equal(batch.buckets[1].scoreTimeSum / batch.buckets[1].validMs, 75);
  const db = new RecordRepository(':memory:'); db.write(batch); assert.equal(db.integrity(), 'ok'); db.close();
});
test('pending retries remain immutable while new observations arrive', () => {
  const capture = create(1800000000000); capture.sample(0, evaluation(0, 0, 100)); capture.sample(500, evaluation(500, 50000, 100));
  const first = structuredClone(capture.batch(0)); capture.sample(700, evaluation(500, 50000, null)); capture.advance(2000);
  assert.deepEqual(capture.batch(0), first);
  capture.acknowledge(); capture.finish(3000); const final = capture.batch(0);
  assert.equal(final.sequence, 1); assert.equal(final.record.runMs, 3000); assert.equal(final.record.validMs, 500);
  const db = new RecordRepository(':memory:'); db.write(first); db.write(first); db.write(final); db.close();
});
test('long disconnected intervals drain in bounded batches', () => {
  const capture = create(1800000000000); capture.finish(181 * 60_000);
  const db = new RecordRepository(':memory:'); let count = 0;
  do { const batch = capture.batch(0); assert.ok(batch.buckets.length <= 120); db.write(batch); capture.acknowledge(); count++; if (batch.record.status === 'finished') break; } while (count < 10);
  assert.equal(count, 2); assert.equal(db.detail('demo', 'one').record.runMs, 181 * 60_000); db.close();
});
test('late callbacks cannot alter finalized records', () => {
  const capture = create(); capture.finish(1000); const before = structuredClone(capture.batch(0));
  capture.sample(1200, evaluation(1000, 100000, 100)); capture.finish(1500);
  assert.deepEqual(capture.batch(0), before);
});
