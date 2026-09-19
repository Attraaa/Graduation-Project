import test from 'node:test';
import assert from 'node:assert/strict';
import { CaptureRecorder } from '../../database/recorder.ts';
import { RecordRepository } from '../../database/sqlite/repository.ts';
import { sampleBatch } from './fixtures/record-batch.mjs';
import { summarizeStatistics, scoreDifference } from '../../database/aggregation.ts';

function add(db, id, start, duration, score, mode = 'turtle', version = 'v1', owner = 'demo') {
  const capture = new CaptureRecorder({ ...sampleBatch().record, id, owner, mode, scorePolicyVersion: version,
    startedAt: start, updatedAt: start, offsetMinutes: 0 }, 0);
  for (let at = 0; at <= duration; at += 500) capture.sample(at, {
    validMs: score === null ? 0 : at, scoreTimeSum: score === null ? 0 : at * score, currentScore: score, deviationMs: 0, deviationEpisodeCount: 0,
  });
  capture.finish(duration); db.write(capture.batch(0));
}
test('time-weighted averages preserve measured zero and separate policies and modes', () => {
  const db = new RecordRepository(':memory:'); const start = Date.parse('2026-09-19T10:00:00Z');
  add(db, 'long', start, 9000, 100); add(db, 'zero', start, 1000, 0); add(db, 'missing', start, 1000, null);
  add(db, 'shoulder', start, 1000, 20, 'shoulder'); add(db, 'newversion', start, 1000, 10, 'turtle', 'v2'); add(db, 'other', start, 1000, 10, 'turtle', 'v1', 'other');
  const groups = summarizeStatistics(db.statistics({ owner: 'demo', from: '2026-09-19', to: '2026-09-19' }));
  assert.equal(groups.length, 3);
  const group = groups.find(row => row.mode === 'turtle' && row.scorePolicyVersion === 'v1');
  assert.equal(group.average, 90); assert.equal(group.sessionCount, 3); assert.equal(group.unknownMs, 1000);
  assert.equal(scoreDifference(group, groups.find(row => row.mode === 'shoulder')), null); db.close();
});
test('cross-midnight observations belong to actual days, history remains on start day', () => {
  const db = new RecordRepository(':memory:'); add(db, 'midnight', Date.parse('2026-12-31T23:59:59Z'), 2000, 50);
  const rows = db.statistics({ owner: 'demo', from: '2026-12-31', to: '2027-01-01' });
  assert.equal(rows.length, 2); assert.equal(rows[0].validMs, 1000); assert.equal(rows[1].validMs, 1000);
  assert.equal(summarizeStatistics(rows)[0].sessionCount, 1);
  assert.equal(db.list({ owner: 'demo', from: '2027-01-01', to: '2027-01-01' }).records.length, 0);
  assert.equal(db.list({ owner: 'demo', from: '2026-12-31', to: '2026-12-31' }).counts['2026-12-31'], 1); db.close();
});
