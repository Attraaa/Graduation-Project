import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceEvaluation, createEvaluation, interruptEvaluation } from '../src/features/posture/evaluation.ts';
import { createObservation } from '../src/features/posture/observation.ts';
import { turtleScorePolicy as neck } from '../src/features/posture/modes/turtle.ts';
import { shoulderScorePolicy as shoulder } from '../src/features/posture/modes/shoulder.ts';
import { scorePosture } from '../src/features/posture/scoring.ts';
import { NECK_SUSTAINED as config } from '../src/features/posture/scoreSettings.ts';
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

test('stable substantial head-only departure crosses the raw 50 point floor after five seconds', () => {
  for (const [seconds, expected] of [[0, 50], [5, 50], [10, 40], [20, 20], [30, 0], [90, 0]]) {
    const state = run(seconds * 1000);
    close(state.rawScore, 50); close(state.currentScore, expected);
    assert.ok(state.sustained.penaltyPoints >= 0 && state.sustained.penaltyPoints <= 100);
  }
  close(run(config.delayMs + 100).currentScore, 49.8);
  assert.ok(run(10000).averageScore < 50);
});

test('head-only posture near eighty points earns the same timed penalty, even without an MLP contribution', () => {
  const values = delta({ headForward: .072 / .35 });
  for (const [seconds, expected] of [[5, 80], [10, 70], [20, 50], [45, 0]]) {
    const state = run(seconds * 1000, 100, values);
    close(state.rawScore, 80); close(state.currentScore, expected);
  }
});

test('good, mild, model-only and slump-only posture never earn a sustained head penalty', () => {
  for (const values of [delta({ headForward: 0 }), delta({ headForward: .14 }),
    delta({ headForward: .064 / .35 }), delta({ headForward: .159, neckSlump: .2 }),
    delta({ headForward: .1, torsoForward: 1 }), delta({ headForward: 0, neckSlump: .5 })]) {
    const state = run(120000, 500, values);
    close(state.sustained.penaltyPoints, 0); close(state.currentScore, scorePosture(values, neck).score);
  }
  const state = run(60000, 500, delta({ shoulderTilt: .15 }), shoulder);
  close(state.sustained.penaltyPoints, 0); close(state.currentScore, scorePosture(delta({ shoulderTilt: .15 }), shoulder).score);
});

test('short excursions and threshold chatter must earn five continuous seconds again', () => {
  let state = run(4900);
  state = feed(state, 5000, delta({ headForward: .064 / .35 }));
  for (let ms = 5100; ms <= 10100; ms += 100) state = feed(state, ms);
  close(state.sustained.penaltyPoints, 0); close(state.sustained.continuousMs, 5000);
  state = feed(state, 10200); close(state.sustained.penaltyPoints, .2);
});

test('motion, loss, pause, duplicate time and long gaps cannot add time or erase earned penalties', () => {
  const before = run(10000);
  for (const interruption of ['moving', 'missing', 'pause', 'duplicate', 'gap']) {
    let state = interruption === 'moving' ? feed(before, 10100, delta(), 1)
      : interruption === 'missing' ? feed(before, 10100, null)
        : interruption === 'pause' ? interruptEvaluation(before)
          : feed(before, interruption === 'duplicate' ? 10000 : 11000);
    close(state.sustained.penaltyPoints, 10); close(state.sustained.continuousMs, 0);
    state = feed(state, 12000);
    close(state.currentScore, 40); close(state.sustained.penaltyPoints, 10);
    for (let ms = 12100; ms <= 17000; ms += 100) state = feed(state, ms);
    close(state.currentScore, 40); close(state.sustained.penaltyPoints, 10);
    state = feed(state, 17100); close(state.currentScore, 39.8);
  }
});

test('brief improvements cannot erase penalty, stable mild or reference posture clears it', () => {
  const before = run(10000);
  for (const headForward of [0, .12, .044 / .35]) {
    let state = feed(before, 10100, delta({ headForward }));
    for (let ms = 10200; ms <= 11000; ms += 100) state = feed(state, ms, delta({ headForward }));
    close(state.sustained.penaltyPoints, 10);
    state = feed(state, 11100, delta({ headForward })); close(state.sustained.penaltyPoints, 0);
    close(state.currentScore, scorePosture(delta({ headForward }), neck).score);
  }
  let state = feed(before, 10100, delta({ headForward: 0 }));
  state = feed(state, 10200); close(state.sustained.penaltyPoints, 10);
  state = feed(state, 10300, delta({ headForward: 0 }), 1);
  state = feed(state, 10400, delta({ headForward: 0 })); close(state.sustained.recoveryMs, 0);
  // Between entry/recovery thresholds: hold the earned penalty, do not add more.
  state = before;
  for (let ms = 10100; ms <= 20000; ms += 100) state = feed(state, ms, delta({ headForward: .055 / .35 }));
  close(state.sustained.penaltyPoints, 10);
});

test('elapsed time, protected score averages and policy resets remain consistent across frame densities', () => {
  const dense = run(10000, 100), sparse = run(10000, 500);
  close(dense.currentScore, sparse.currentScore); close(dense.averageScore, sparse.averageScore);
  close(dense.sustained.continuousMs, sparse.sustained.continuousMs);
  const reset = feed(dense, 10100, delta(), 0, { ...neck, version: 'different-policy' });
  close(reset.sustained.penaltyPoints, 0); close(reset.currentScore, 50); close(reset.validMs, 0);
  close(createEvaluation(neck).sustained.penaltyPoints, 0);
});

test('recording stores the time-penalized display average and excludes missing intervals', () => {
  let state = createEvaluation(neck);
  const capture = new CaptureRecorder({ ...sampleBatch().record, id: 'sustained-neck', mode: 'turtle',
    scorePolicyVersion: neck.version, habitPolicyVersion: state.habitPolicyVersion }, 0);
  for (let ms = 0; ms <= 20000; ms += 100) {
    state = feed(state, ms, ms > 12000 && ms < 15000 ? null : delta());
    capture.sample(ms, state);
  }
  capture.finish(20000);
  const db = new MemoryRecords(); db.write(capture.batch(0));
  const stored = db.detail('demo', capture.record.id).record;
  close(stored.scoreTimeSum, state.scoreTimeSum); close(stored.validMs, state.validMs);
  assert.ok(stored.scoreTimeSum / stored.validMs < 50 && stored.validMs < 20000);
  assert.equal(stored.scorePolicyVersion, neck.version);
});
