import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceEvaluation, createEvaluation } from '../src/features/posture/evaluation.ts';
import { advanceObservation, createObservation } from '../src/features/posture/observation.ts';
import { turtleScorePolicy } from '../src/features/posture/modes/turtle.ts';
import { CaptureRecorder } from '../../database/recorder.ts';
import { RecordRepository } from '../../database/sqlite/repository.ts';
import { sampleBatch } from './fixtures/record-batch.mjs';

// Feed the real observation/evaluation reducers; no UI sampling or reimplemented score formula.
test('capture storage conserves real evaluation totals across missing, duplicate and late frames', () => {
  const baseline = { schemaVersion: 1, sourceId: 'camera-one', widthPx: 1000, heightPx: 1000,
    startedAtMs: 0, completedAtMs: 3000, sampleCount: 31,
    metrics: { noseOffsetShoulderWidths: 0, noseHeightShoulderWidths: 0.5, shoulderHeightDifferenceShoulderWidths: 0 } };
  const policy = turtleScorePolicy;
  let observation = createObservation(), evaluation = createEvaluation(policy);
  const capture = new CaptureRecorder({ ...sampleBatch().record, scorePolicyVersion: policy.version,
    startedAt: Date.parse('2026-12-31T23:59:59Z'), updatedAt: Date.parse('2026-12-31T23:59:59Z') }, 3000);
  const times = [3000, 3100, 3600, 3600, 3500, 3700, 3800, 4300, 4800, 5300, 5800, 6300, 6800, 7300, 7800, 7900, 8100, 8200];
  for (const at of times) {
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
    landmarks[0] = { x: at < 3700 ? 0.5 : 0.6, y: 0.25, visibility: at === 7900 ? 0 : 1 };
    landmarks[11] = { x: 0.75, y: 0.5, visibility: 1 }; landmarks[12] = { x: 0.25, y: 0.5, visibility: 1 };
    observation = advanceObservation(observation, baseline, { landmarks, widthPx: 1000, heightPx: 1000, sourceId: 'camera-one', timestampMs: at });
    evaluation = advanceEvaluation(evaluation, observation, policy);
    capture.sample(at, evaluation);
  }
  capture.finish(8500);
  const db = new RecordRepository(':memory:'); db.write(capture.batch(0));
  const { record } = db.detail('demo', 'one');
  for (const field of ['validMs', 'scoreTimeSum', 'deviationMs', 'deviationEpisodeCount', 'longestContinuousMs']) {
    assert.ok(Math.abs(record[field] - evaluation[field]) < 0.001, field + ': ' + record[field] + ' != ' + evaluation[field]);
  }
  assert.ok(record.deviationEpisodeCount > 0); assert.ok(record.validMs < record.runMs); db.close();
});