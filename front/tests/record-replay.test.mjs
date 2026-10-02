import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceEvaluation, createEvaluation } from '../src/features/posture/evaluation.ts';
import { advanceObservation, createObservation } from '../src/features/posture/observation.ts';
import { turtleScorePolicy } from '../src/features/posture/modes/turtle.ts';
import { CaptureRecorder } from '../../database/recorder.ts';
import { MemoryRecords } from './fixtures/memory-records.mjs';
import { sampleBatch } from './fixtures/record-batch.mjs';

// Feed the real observation/evaluation reducers; no UI sampling or reimplemented score formula.
test('capture storage conserves real evaluation totals across missing, duplicate and late frames', () => {
  const baseline = { schemaVersion: 2, baseEarSpanPx: 200, baseShoulderSpanPx: 500, baseEarHeightPx: 250, sourceId: 'camera-one', widthPx: 1000, heightPx: 1000,
    startedAtMs: 0, completedAtMs: 3000, sampleCount: 31,
    metrics: { earOffsetShoulderWidths: 0, earHeightShoulderWidths: 0.5, shoulderHeightDifferenceShoulderWidths: 0 } };
  const policy = turtleScorePolicy;
  let observation = createObservation(), evaluation = createEvaluation(policy);
  const capture = new CaptureRecorder({ ...sampleBatch().record, scorePolicyVersion: policy.version,
    startedAt: Date.parse('2026-12-31T23:59:59Z'), updatedAt: Date.parse('2026-12-31T23:59:59Z') }, 3000);
  const times = [3000, 3100, 3600, 3600, 3500, 3700, 3800, 4300, 4800, 5300, 5800, 6300, 6800, 7300, 7800, 7900, 8100, 8200];
  for (const at of times) {
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
    landmarks[0] = { x: 0.5, y: 0.25, visibility: at === 7900 ? 0 : 1 };
    landmarks[7] = { x: 0.6, y: at < 3700 ? 0.25 : 0.55, visibility: 1 };
    landmarks[8] = { x: 0.4, y: at < 3700 ? 0.25 : 0.55, visibility: 1 };
    landmarks[11] = { x: 0.75, y: 0.5, visibility: 1 }; landmarks[12] = { x: 0.25, y: 0.5, visibility: 1 };
    observation = advanceObservation(observation, baseline, { landmarks, widthPx: 1000, heightPx: 1000, sourceId: 'camera-one', timestampMs: at });
    evaluation = advanceEvaluation(evaluation, observation, policy);
    capture.sample(at, evaluation);
  }
  capture.finish(8500);
  const db = new MemoryRecords(); db.write(capture.batch(0));
  const { record } = db.detail('demo', 'one');
  for (const field of ['validMs', 'scoreTimeSum', 'deviationMs', 'deviationEpisodeCount', 'longestContinuousMs']) {
    assert.ok(Math.abs(record[field] - evaluation[field]) < 0.001, field + ': ' + record[field] + ' != ' + evaluation[field]);
  }
  assert.ok(record.deviationEpisodeCount > 0); assert.ok(record.validMs < record.runMs);
});
// Verify both real scoring streams are stored independently without mixing old policies.
test('upper-body paired scores persist independently and preserve earlier policy records', async () => {
  const { advanceCalibration, createCalibration } = await import('../src/features/posture/calibration.ts');
  const { shoulderScorePolicy } = await import('../src/features/posture/modes/shoulder.ts');
  const { localDateKey } = await import('../../database/contracts.ts');
  const { summarizeStatistics } = await import('../../database/aggregation.ts');
  const frame = at => {
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
    const changed = at >= 4000;
    landmarks[0] = { x: 0.5, y: 0.25, visibility: 1 };
    landmarks[7] = { x: changed ? 0.65 : 0.6, y: 0.25, visibility: 1 };
    landmarks[8] = { x: changed ? 0.35 : 0.4, y: 0.25, visibility: 1 };
    landmarks[11] = { x: 0.75, y: changed ? 0.55 : 0.5, visibility: 1 };
    landmarks[12] = { x: 0.25, y: changed ? 0.45 : 0.5, visibility: 1 };
    return { landmarks, widthPx: 1000, heightPx: 1000, sourceId: 'paired-camera', timestampMs: at };
  };
  let calibration = createCalibration();
  for (let at=0; at<=3000; at+=100) calibration=advanceCalibration(calibration,frame(at));
  assert.ok(calibration.reference);
  const policies=[turtleScorePolicy,shoulderScorePolicy];
  const captures=policies.map(policy => new CaptureRecorder({ ...sampleBatch().record, id: `pair:${policy.mode}`,
    mode: policy.mode, scorePolicyVersion: policy.version, habitPolicyVersion: createEvaluation(policy).habitPolicyVersion },3000));
  let observation=createObservation();
  let evaluations=policies.map(createEvaluation);
  for (let at=3000; at<=16000; at+=100) {
    observation=advanceObservation(observation,calibration.reference,frame(at));
    evaluations=evaluations.map((state,index)=>advanceEvaluation(state,observation,policies[index]));
    captures.forEach((capture,index)=>capture.sample(at,evaluations[index]));
  }
  const db=new MemoryRecords();
  db.write(sampleBatch());
  for (const capture of captures) { capture.finish(16000); db.write(capture.batch(0)); }
  {
    const records=captures.map(capture=>db.detail('demo',capture.record.id).record);
    records.forEach((record,index)=>{
      assert.ok(Math.abs(record.scoreTimeSum - evaluations[index].scoreTimeSum)<0.001);
      assert.ok(Math.abs(record.validMs - evaluations[index].validMs)<0.001);
      assert.equal(record.status,'finished');
    });
    assert.equal(records[0].startedAt,records[1].startedAt);
    assert.notEqual(records[0].scoreTimeSum,records[1].scoreTimeSum);
    assert.equal(db.detail('demo','one').record.scorePolicyVersion,'turtle-v1');
    const date=localDateKey(records[0].startedAt,records[0].offsetMinutes);
    const groups=summarizeStatistics(db.statistics({owner:'demo',from:date,to:date}));
    for(const policy of policies) assert.ok(groups.some(group=>group.mode===policy.mode && group.scorePolicyVersion===policy.version));
  }
});
