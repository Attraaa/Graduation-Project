import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceEvaluation, createEvaluation, HABIT_POLICY, interruptEvaluation } from '../src/features/posture/evaluation.ts';
import { advanceObservation, createObservation, interruptObservation } from '../src/features/posture/observation.ts';

const policy = Object.freeze({
  version: 'test-head-reference-v1', mode: 'turtle',
  metrics: Object.freeze(['noseOffsetShoulderWidths', 'noseHeightShoulderWidths']),
  fullCreditDelta: 0.05, zeroCreditDelta: 0.30,
});

function observed(observedMs, deviation = 0) {
  return {
    ...createObservation(), observedSeconds: observedMs / 1000,
    delta: deviation === null ? null : {
      noseOffsetShoulderWidths: deviation,
      noseHeightShoulderWidths: 0,
      shoulderHeightDifferenceShoulderWidths: 0,
    },
  };
}

function replay(samples, selectedPolicy = policy) {
  return samples.reduce((state, [ms, deviation]) => advanceEvaluation(state, observed(ms, deviation), selectedPolicy), createEvaluation(selectedPolicy));
}

function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be close to ${expected}`);
}

const baseline = {
  schemaVersion: 1, sourceId: 'camera-one', widthPx: 1000, heightPx: 1000,
  startedAtMs: 0, completedAtMs: 3000, sampleCount: 31,
  metrics: { noseOffsetShoulderWidths: 0, noseHeightShoulderWidths: 0.5, shoulderHeightDifferenceShoulderWidths: 0 },
};

function frame(timestampMs, overrides = {}) {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  landmarks[0] = { x: 0.5, y: 0.25, visibility: 1 };
  landmarks[11] = { x: 0.75, y: 0.5, visibility: 1 };
  landmarks[12] = { x: 0.25, y: 0.5, visibility: 1 };
  return { landmarks, widthPx: 1000, heightPx: 1000, sourceId: 'camera-one', timestampMs, ...overrides };
}

function advancePair(previous, input, reference = baseline) {
  const observation = advanceObservation(previous.observation, reference, input);
  return { observation, evaluation: advanceEvaluation(previous.evaluation, observation, policy) };
}

function pair() {
  return { observation: createObservation(), evaluation: createEvaluation(policy) };
}

test('identical inputs give identical scores and habits without mutating state, observations or policy', () => {
  const samples = [[0, 0], [100, 0.10], [500, 0.3], [500, null], [500, 0], [1000, 0]];
  const state = createEvaluation(policy);
  const observation = observed(100, 0.15);
  const before = structuredClone({ state, observation, policy, samples });
  advanceEvaluation(state, observation, policy);
  assert.deepEqual(replay(samples), replay(samples));
  assert.deepEqual({ state, observation, policy, samples }, before);
  assert.equal(Object.isFrozen(HABIT_POLICY), true);
});

test('no data yields null, first frame has a current score only, and measured zero is a real average', () => {
  const missing = replay([[0, null], [0, null]]);
  assert.equal(missing.currentScore, null);
  assert.equal(missing.averageScore, null);
  assert.equal(missing.validMs, 0);
  const first = replay([[0, 0.3]]);
  assert.equal(first.currentScore, 0);
  assert.equal(first.averageScore, null);
  const zero = replay([[0, 0.3], [100, 0.3]]);
  assert.equal(zero.averageScore, 0);
  assert.equal(zero.validMs, 100);
  assert.equal(zero.deviationEpisodeCount, 0);
});

test('average integrates both interval endpoints and time, not the number of frames', () => {
  const state = replay([[0, 0], [100, 0.3], [500, 0.3]]);
  close(state.averageScore, 10); // (100 + 0) / 2 * 100ms, then 400ms at zero.
  close(state.validMs, 500);
  const sparse = replay([[0, 0.175], [500, 0.175], [1000, 0.175]]);
  const dense = replay(Array.from({ length: 101 }, (_, i) => [i * 10, 0.175]));
  close(sparse.averageScore, 50);
  close(dense.averageScore, sparse.averageScore);
  close(dense.validMs, sparse.validMs);
});

test('missing intervals do not add zero scores, inflate time or imply misuse/rest', () => {
  const state = replay([[0, 0], [100, 0], [100, null], [100, 0.3], [200, 0.3]]);
  close(state.averageScore, 50);
  close(state.validMs, 200);
  close(state.continuousMs, 100);
  assert.equal(state.deviationEpisodeCount, 0);
  for (const field of ['diagnosis', 'isCorrect', 'isResting', 'misuse']) assert.equal(field in state, false);
});

test('observation gaps of 500ms are included, longer gaps break continuity', () => {
  const first = advancePair(pair(), frame(3000));
  for (const gap of [499, 500, 501]) {
    const state = advancePair(first, frame(3000 + gap)).evaluation;
    assert.equal(state.validMs, gap <= 500 ? gap : 0);
    assert.equal(state.averageScore, gap <= 500 ? 100 : null);
    assert.equal(state.continuousMs, gap <= 500 ? gap : 0);
  }
});

test('cumulative floating point error does not reject an accepted 500ms interval', () => {
  const state = replay([[0, 0], [100, 0], [600, 0], [1100, 0]]);
  close(state.validMs, 1100);
  close(state.continuousMs, 1100);
  assert.equal(state.averageScore, 100);
});

test('duplicate and reversed capture times break continuity and never double count intervals', () => {
  let first = advancePair(pair(), frame(3000));
  first = advancePair(first, frame(3100));
  for (const time of [3100, 3050]) {
    const invalid = advancePair(first, frame(time));
    assert.equal(invalid.evaluation.currentScore, null);
    assert.equal(invalid.evaluation.continuousMs, 0);
    close(invalid.evaluation.validMs, 100);
    const resumed = advancePair(invalid, frame(3200));
    close(resumed.evaluation.validMs, 100);
    const following = advancePair(resumed, frame(3300));
    close(following.evaluation.validMs, 200);
    close(following.evaluation.continuousMs, 100);
  }
});

test('new reference and camera changes cannot join earlier score intervals', () => {
  let first = advancePair(pair(), frame(3000));
  first = advancePair(first, frame(3100));
  const changed = advancePair(first, frame(3200), { ...baseline, completedAtMs: 3200 });
  close(changed.evaluation.validMs, 100);
  assert.equal(changed.evaluation.continuousMs, 0);
  assert.equal(changed.evaluation.deviationState, 'unknown');
  const newCamera = advancePair(first, frame(3200, { sourceId: 'camera-two' }));
  assert.equal(newCamera.evaluation.currentScore, null);
  close(newCamera.evaluation.validMs, 100);
});

test('explicit interruption retains totals and longest interval but resets current state', () => {
  const first = replay([[0, 0], [500, 0], [1000, 0]]);
  const interrupted = interruptEvaluation(first);
  assert.equal(interrupted.currentScore, null);
  assert.equal(interrupted.currentDeviation, null);
  assert.equal(interrupted.continuousMs, 0);
  assert.equal(interrupted.deviationState, 'unknown');
  assert.equal(interrupted.longestContinuousMs, 1000);
  assert.equal(interrupted.averageScore, 100);
  assert.equal(interrupted.validMs, 1000);
  assert.equal(first.currentScore, 100);
  let integration = advancePair(pair(), frame(3000));
  integration = { observation: interruptObservation(integration.observation), evaluation: interruptEvaluation(integration.evaluation) };
  const resumed = advancePair(integration, frame(3500));
  assert.equal(resumed.evaluation.validMs, 0);
});

test('a departure requires both endpoints at the enter boundary for at least 2000ms', () => {
  const almost = replay([[0, 0.15], [500, 0.15], [1000, 0.15], [1500, 0.15], [1999, 0.15]]);
  assert.equal(almost.deviationEpisodeCount, 0);
  assert.equal(almost.deviationState, 'pending');
  const entered = advanceEvaluation(almost, observed(2000, 0.15), policy);
  assert.equal(entered.deviationEpisodeCount, 1);
  assert.equal(entered.deviationState, 'away');
  assert.equal(entered.deviationMs, 0); // Confirmation does not retroactively label the pending 2s.
  const below = replay(Array.from({ length: 11 }, (_, i) => [i * 500, 0.15 - 1e-10]));
  assert.equal(below.deviationEpisodeCount, 0);
  assert.equal(below.deviationState, 'near-reference');
  const transition = replay([[0, 0], [500, 0.15]]);
  assert.equal(transition.pendingMs, 0);
});

test('confirmed departures use the exit boundary and count only intervals with both endpoints away', () => {
  const entered = replay(Array.from({ length: 5 }, (_, i) => [i * 500, 0.15]));
  const continuing = advanceEvaluation(entered, observed(2500, 0.1 + 1e-10), policy);
  assert.equal(continuing.deviationState, 'away');
  close(continuing.deviationMs, 500);
  assert.equal(continuing.deviationEpisodeCount, 1);
  const exited = advanceEvaluation(continuing, observed(3000, 0.1), policy);
  assert.equal(exited.deviationState, 'near-reference');
  close(exited.deviationMs, 500);
  const reentered = [[3500, 0.15], [4000, 0.15], [4500, 0.15], [5000, 0.15], [5500, 0.15]]
    .reduce((state, [ms, delta]) => advanceEvaluation(state, observed(ms, delta), policy), exited);
  assert.equal(reentered.deviationEpisodeCount, 2);
  close(reentered.deviationMs, 500);
});

test('pending departures reset below enter threshold or at missing observations', () => {
  const pending = replay([[0, 0.15], [500, 0.15], [1000, 0.15], [1500, 0.15]]);
  for (const delta of [0.15 - 1e-10, null]) {
    const reset = advanceEvaluation(pending, observed(delta === null ? 1500 : 1600, delta), policy);
    assert.equal(reset.pendingMs, 0);
    assert.equal(reset.deviationEpisodeCount, 0);
    const resumed = advanceEvaluation(reset, observed(1700, 0.15), policy);
    assert.equal(resumed.deviationEpisodeCount, 0);
    assert.equal(resumed.pendingMs, 0);
  }
});

test('missing data or a broken interval ends a confirmed departure without inventing a return', () => {
  const away = replay(Array.from({ length: 6 }, (_, i) => [i * 500, 0.15]));
  for (const observation of [observed(2500, null), observed(2500, 0.15)]) {
    const reset = advanceEvaluation(away, observation, policy);
    assert.equal(reset.deviationState, 'unknown');
    assert.equal(reset.deviationEpisodeCount, 1);
    assert.equal(reset.pendingMs, 0);
    close(reset.deviationMs, 500);
  }
});

test('policy version changes start new score and habit totals without bridging the old interval', () => {
  const previous = replay(Array.from({ length: 6 }, (_, i) => [i * 500, 0.15]));
  const nextPolicy = { ...policy, version: 'test-head-reference-v2' };
  const reset = advanceEvaluation(previous, observed(3000, 0), nextPolicy);
  assert.equal(reset.scorePolicyVersion, nextPolicy.version);
  assert.equal(reset.habitPolicyVersion, HABIT_POLICY.version);
  assert.equal(reset.currentScore, 100);
  assert.equal(reset.averageScore, null);
  assert.equal(reset.validMs, 0);
  assert.equal(reset.deviationEpisodeCount, 0);
  assert.equal(reset.deviationMs, 0);
  assert.equal(reset.longestContinuousMs, 0);
  const resumed = advanceEvaluation(reset, observed(3500, 0), nextPolicy);
  assert.equal(resumed.validMs, 500);
  assert.equal(resumed.averageScore, 100);
});

test('midnight does not reset monotonic score and habit accumulation', () => {
  const start = Date.parse('2026-09-12T23:59:57+09:00');
  const wallTimes = ['2026-09-12T23:59:59.000+09:00', '2026-09-12T23:59:59.500+09:00', '2026-09-13T00:00:00.000+09:00'];
  const state = replay(wallTimes.map(time => [Date.parse(time) - start, 0.15]));
  close(state.validMs, 1000);
  close(state.continuousMs, 1000);
  close(state.pendingMs, 1000);
  close(state.averageScore, 60);
});

test('a habit policy version change cannot mix previous episode or score totals', () => {
  const previous = replay(Array.from({ length: 6 }, (_, i) => [i * 500, 0.15]));
  const reset = advanceEvaluation({ ...previous, habitPolicyVersion: 'reference-deviation-old' }, observed(3000, 0), policy);
  assert.equal(reset.habitPolicyVersion, HABIT_POLICY.version);
  assert.equal(reset.currentScore, 100);
  assert.equal(reset.averageScore, null);
  assert.equal(reset.validMs, 0);
  assert.equal(reset.deviationEpisodeCount, 0);
  assert.equal(reset.deviationMs, 0);
});
