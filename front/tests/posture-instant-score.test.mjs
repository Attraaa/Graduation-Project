import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceEvaluation, createEvaluation, interruptEvaluation, HABIT_POLICY } from '../src/features/posture/evaluation.ts';
import { createObservation } from '../src/features/posture/observation.ts';
import { turtleScorePolicy as neck } from '../src/features/posture/modes/turtle.ts';
import { shoulderScorePolicy as shoulder } from '../src/features/posture/modes/shoulder.ts';
import { scorePosture } from '../src/features/posture/scoring.ts';
import { CaptureRecorder } from '../../database/recorder.ts';
import { MemoryRecords } from './fixtures/memory-records.mjs';
import { sampleBatch } from './fixtures/record-batch.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const delta = (overrides = {}) => ({ headForward: .12 / .35, torsoForward: 0, neckSlump: 0, shoulderTilt: 0, shoulderShrug: 0, yawRatio: 0, ...overrides });
const feed = (state, ms, values = delta(), velocity = 0, policy = neck) => advanceEvaluation(state,
  { ...createObservation(), observedSeconds: ms / 1000, delta: values, velocityShoulderWidthsPerSecond: velocity }, policy);
function run(until, interval = 100, values = delta(), policy = neck) {
  let state = createEvaluation(policy);
  for (let ms = 0; ms <= until; ms += interval) state = feed(state, ms, values, 0, policy);
  return state;
}

test('holding head-only posture keeps its fifty or eighty point score without timed deductions', () => {
  for (const [headForward, expected] of [[.12 / .35, 50], [.072 / .35, 80]]) {
    for (const seconds of [0, 5, 10, 20, 45, 120]) {
      const state = run(seconds * 1000, 100, delta({ headForward }));
      close(state.rawScore, expected); close(state.currentScore, expected);
      if (seconds) close(state.averageScore, expected);
    }
  }
});

test('after motion protection settles, scores follow posture changes and stop at the new raw score', () => {
  const mild = delta({ headForward: .072 / .35 });
  let state = feed(createEvaluation(neck), 0, delta({ headForward: 0 }));
  for (let ms = 100; ms <= 120000; ms += 100) {
    state = feed(state, ms, mild);
    if (ms === 2100) close(state.currentScore, 100);
    if (ms >= 4000) close(state.currentScore, 80);
  }
  for (let ms = 120100; ms <= 180000; ms += 100) state = feed(state, ms);
  close(state.currentScore, 50);
  state = feed(state, 180100, mild);
  close(state.rawScore, 80); close(state.currentScore, 80);
  for (let ms = 180200; ms <= 240000; ms += 100) state = feed(state, ms, mild);
  close(state.currentScore, 80);
  for (let ms = 240100; ms <= 241000; ms += 100) {
    state = feed(state, ms, delta({ headForward: 0 }));
    close(state.currentScore, 80); assert.equal(state.protection, 'recovering');
  }
  state = feed(state, 241100, delta({ headForward: 0 }));
  close(state.currentScore, 100);
});

test('long holds preserve current geometry scores for good, mild, model-assisted and shoulder posture', () => {
  for (const values of [delta({ headForward: 0 }), delta({ headForward: .14 }),
    delta({ headForward: .12 / .35, torsoForward: .08 }), delta({ headForward: 0, neckSlump: .5 }), delta({ headForward: 1 })]) {
    const state = run(120000, 500, values);
    close(state.currentScore, scorePosture(values, neck).score);
    close(state.averageScore, state.currentScore);
  }
  const values = delta({ shoulderTilt: 6 * Math.PI / 180 });
  const state = run(120000, 500, values, shoulder);
  close(state.currentScore, scorePosture(values, shoulder).score);
  close(state.averageScore, state.currentScore);
});

test('motion, loss, pause, duplicate time and long gaps never accumulate a lower score', () => {
  const before = run(10000);
  for (const interruption of ['moving', 'missing', 'pause', 'duplicate', 'gap']) {
    let state = interruption === 'moving' ? feed(before, 10100, delta(), 1)
      : interruption === 'missing' ? feed(before, 10100, null)
        : interruption === 'pause' ? interruptEvaluation(before)
          : feed(before, interruption === 'duplicate' ? 10000 : 11000);
    if (interruption === 'missing' || interruption === 'pause') assert.equal(state.currentScore, null);
    state = feed(state, 12000);
    close(state.currentScore, 50);
    for (let ms = 12100; ms <= 120000; ms += 100) state = feed(state, ms);
    close(state.currentScore, 50); close(state.averageScore, 50);
  }
});

test('held-pose scores and averages are independent of frame density', () => {
  const dense = run(120000, 100), sparse = run(120000, 500);
  close(dense.currentScore, 50); close(dense.currentScore, sparse.currentScore);
  close(dense.averageScore, sparse.averageScore); close(dense.validMs, sparse.validMs);
});

test('the new neck policy resets old timed scores while shoulder and habit policies stay compatible', () => {
  assert.match(neck.version, /^upper-body-neck-v7-/);
  assert.equal(shoulder.version, 'upper-body-shoulder-v6-9o3ijg');
  assert.equal(HABIT_POLICY.version, 'weighted-reference-deviation-v6');
  const old = { ...run(10000), scorePolicyVersion: 'upper-body-neck-v6-1fzxkw0', currentScore: 20, lastScore: 20 };
  const state = feed(old, 10100);
  close(state.currentScore, 50); close(state.validMs, 0);
  assert.equal(state.averageScore, null); assert.equal(state.scorePolicyVersion, neck.version);
});

test('recording stores the current-pose display average and excludes missing intervals', () => {
  let state = createEvaluation(neck);
  const capture = new CaptureRecorder({ ...sampleBatch().record, id: 'instant-neck', mode: 'turtle',
    scorePolicyVersion: neck.version, habitPolicyVersion: state.habitPolicyVersion }, 0);
  for (let ms = 0; ms <= 20000; ms += 100) {
    state = feed(state, ms, ms > 12000 && ms < 15000 ? null : delta());
    capture.sample(ms, state);
  }
  capture.finish(20000);
  const db = new MemoryRecords(); db.write(capture.batch(0));
  const stored = db.detail('demo', capture.record.id).record;
  close(stored.scoreTimeSum, state.scoreTimeSum); close(stored.validMs, state.validMs);
  close(stored.scoreTimeSum / stored.validMs, 50); assert.ok(stored.validMs < 20000);
  assert.equal(stored.scorePolicyVersion, neck.version);
});
