import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceEvaluation, createEvaluation, HABIT_POLICY, interruptEvaluation } from '../src/features/posture/evaluation.ts';
import { neckDeviation, turtleScorePolicy } from '../src/features/posture/modes/turtle.ts';
import { balanceDeviation, balanceScore, balanceScorePolicy } from '../src/features/posture/modes/balance.ts';
import { breakNeckClock, startNeckClock, tickNeckClock } from '../src/features/posture/e19/flow.ts';
import { CaptureRecorder } from '../../database/recorder.ts';
import { MemoryRecords } from './fixtures/memory-records.mjs';
import { sampleBatch } from './fixtures/record-batch.mjs';

// Feed the real clock/evaluation reducers the way PostureMonitor does (measured scores); no reimplemented formula.
test('capture storage conserves real evaluation totals across missing, duplicate and late frames', () => {
  const policy = balanceScorePolicy;
  let clock = startNeckClock(), evaluation = createEvaluation(policy);
  const capture = new CaptureRecorder({ ...sampleBatch().record, mode: 'balance', scorePolicyVersion: policy.version,
    startedAt: Date.parse('2026-12-31T23:59:59Z'), updatedAt: Date.parse('2026-12-31T23:59:59Z') }, 3000);
  const times = [3000, 3100, 3600, 3600, 3500, 3700, 3800, 4300, 4800, 5300, 5800, 6300, 6800, 7300, 7800, 7900, 8100, 8200];
  for (const at of times) {
    // 7900: the face is not seen (no tilt), the others tilt 12° after 3700 (60 points).
    if (at === 7900) { clock = breakNeckClock(clock); evaluation = interruptEvaluation(evaluation); }
    else if (at >= (clock.lastAt ?? -Infinity)) {
      clock = tickNeckClock(clock, at);
      const score = balanceScore(at < 3700 ? 0 : 12);
      evaluation = advanceEvaluation(evaluation, { observedSeconds: clock.seconds }, policy, HABIT_POLICY, { score, deviation: balanceDeviation(score) });
    }
    capture.sample(at, evaluation);
  }
  capture.finish(8500);
  const db = new MemoryRecords(); db.write(capture.batch(0));
  const { record } = db.detail('demo', 'one');
  for (const field of ['validMs', 'scoreTimeSum', 'deviationMs', 'deviationEpisodeCount', 'longestContinuousMs']) {
    assert.ok(Math.abs(record[field] - evaluation[field]) < 0.001, field + ': ' + record[field] + ' != ' + evaluation[field]);
  }
  assert.equal(record.mode, 'balance');
  assert.ok(record.deviationEpisodeCount > 0); assert.ok(record.validMs < record.runMs);
});
// Verify both real scoring streams are stored independently without mixing old policies.
test('upper-body paired scores persist independently and preserve earlier policy records', async () => {
  const { localDateKey } = await import('../../database/contracts.ts');
  const { summarizeStatistics } = await import('../../database/aggregation.ts');
  const policies = [turtleScorePolicy, balanceScorePolicy];
  const captures = policies.map(policy => new CaptureRecorder({ ...sampleBatch().record, id: `pair:${policy.mode}`,
    mode: policy.mode, scorePolicyVersion: policy.version, habitPolicyVersion: createEvaluation(policy).habitPolicyVersion }, 3000));
  let clocks = policies.map(startNeckClock), evaluations = policies.map(policy => createEvaluation(policy));
  // The neck steps 100 → 80 (E19, computed outside), the balance 100 → 60 (a 12° tilt) at the same moment.
  const scores = at => [at >= 4000 ? 80 : 100, balanceScore(at >= 4000 ? 12 : 0)];
  const deviations = [neckDeviation, balanceDeviation];
  for (let at = 3000; at <= 16000; at += 100) {
    clocks = clocks.map(clock => tickNeckClock(clock, at));
    evaluations = evaluations.map((state, index) => advanceEvaluation(state, { observedSeconds: clocks[index].seconds }, policies[index], HABIT_POLICY,
      { score: scores(at)[index], deviation: deviations[index](scores(at)[index]) }));
    captures.forEach((capture, index) => capture.sample(at, evaluations[index]));
  }
  const db = new MemoryRecords();
  db.write(sampleBatch());
  for (const capture of captures) { capture.finish(16000); db.write(capture.batch(0)); }
  const records = captures.map(capture => db.detail('demo', capture.record.id).record);
  records.forEach((record, index) => {
    assert.ok(Math.abs(record.scoreTimeSum - evaluations[index].scoreTimeSum) < 0.001);
    assert.ok(Math.abs(record.validMs - evaluations[index].validMs) < 0.001);
    assert.equal(record.status, 'finished');
  });
  assert.equal(records[0].startedAt, records[1].startedAt);
  assert.notEqual(records[0].scoreTimeSum, records[1].scoreTimeSum);
  assert.equal(db.detail('demo', 'one').record.scorePolicyVersion, 'turtle-v1');
  const date = localDateKey(records[0].startedAt, records[0].offsetMinutes);
  const groups = summarizeStatistics(db.statistics({ owner: 'demo', from: date, to: date }));
  for (const policy of policies) assert.ok(groups.some(group => group.mode === policy.mode && group.scorePolicyVersion === policy.version));
});
