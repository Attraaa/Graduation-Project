import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceCalibration, createCalibration, extractFrontalMeasurement } from '../src/features/posture/calibration.ts';
import { advanceObservation, createObservation } from '../src/features/posture/observation.ts';
import { advanceEvaluation, createEvaluation } from '../src/features/posture/evaluation.ts';
import { scorePosture } from '../src/features/posture/scoring.ts';
import { turtleScorePolicy as neck } from '../src/features/posture/modes/turtle.ts';
import { shoulderScorePolicy as shoulder } from '../src/features/posture/modes/shoulder.ts';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
function frame(at, { scale = 1, shiftX = 0, shiftY = 0, width = 1000, height = 1000, slump = 0, growth = 0, tilt = 0 } = {}) {
  const landmarks = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 1 }));
  landmarks[0] = { x: .5, y: .25 + slump, visibility: 1 };
  landmarks[7] = { x: .6 + growth, y: .25 + slump, visibility: 1 };
  landmarks[8] = { x: .4 - growth, y: .25 + slump, visibility: 1 };
  landmarks[11] = { x: .75, y: .5 + tilt, visibility: 1 };
  landmarks[12] = { x: .25, y: .5 - tilt, visibility: 1 };
  // Same physical 1000x1000 geometry, transformed in pixels (not separately scaled x/y).
  return { sourceId: 'camera', timestampMs: at, widthPx: width, heightPx: height,
    landmarks: landmarks.map(p => ({ ...p, x: ((p.x - .5) * scale + .5 + shiftX) * 1000 / width,
      y: ((p.y - .5) * scale + .5 + shiftY) * 1000 / height })) };
}
function reference(options = {}) {
  let state = createCalibration();
  for (let at = 0; at <= 3000; at += 100) state = advanceCalibration(state, frame(at, options));
  assert.ok(state.reference);
  return state.reference;
}

test('uniform framing scale and translation cannot penalize an unchanged posture', () => {
  const baseline = reference();
  for (const scale of [.65, .8, 1, 1.25, 1.4]) for (const shiftX of [-.1, 0, .1]) {
    const sample = advanceObservation(createObservation(), baseline, frame(3100, { scale, shiftX, shiftY: .05 }));
    for (const policy of [neck, shoulder]) close(scorePosture(sample.delta, policy).score, 100);
  }
});

test('head-only approach is more sensitive while shared approach and hidden hips do not penalize', () => {
  const baseline = reference();
  const headOnly = frame(3100, { growth: .01 }); // Ear span +10%, shoulder span unchanged.
  headOnly.landmarks[23] = { x: .5, y: 1.3, visibility: 0 };
  headOnly.landmarks[24] = { x: .5, y: 1.3, visibility: 0 };
  const sample = advanceObservation(createObservation(), baseline, headOnly);
  close(sample.delta.headForward, .2);
  close(scorePosture(sample.delta, neck).score, 81.25); // Main weights, head-relative response x2.
  close(scorePosture(sample.delta, shoulder).score, 100);
  const together = frame(3100, { scale: 1.2 });
  together.landmarks[23] = together.landmarks[24] = { x: .5, y: 2, visibility: 0 };
  const scaled = advanceObservation(createObservation(), baseline, together);
  close(scorePosture(scaled.delta, neck).score, 100);
  close(scorePosture(scaled.delta, shoulder).score, 100);
});

test('small shoulder changes are tolerated but a sustained large tilt remains penalized', () => {
  const baseline = reference();
  const small = advanceObservation(createObservation(), baseline, frame(3100, { tilt: .01 }));
  close(scorePosture(small.delta, shoulder).score, 100);
  const large = advanceObservation(createObservation(), baseline, frame(3100, { tilt: .08 }));
  assert.ok(scorePosture(large.delta, shoulder).score < 20);
});

test('real head-shape and shoulder deviations remain detectable at every framing scale', () => {
  const baseline = reference();
  for (const posture of [{ slump: .15 }, { growth: .04 }, { tilt: .06 }, { slump: -.15 }]) {
    const target = advanceObservation(createObservation(), baseline, frame(3100, posture));
    assert.ok([neck, shoulder].some(policy => scorePosture(target.delta, policy).score < 100));
    for (const scale of [.65, 1, 1.4]) {
      const transformed = advanceObservation(createObservation(), baseline, frame(3100, { ...posture, scale }));
      // Perspective tolerance deliberately varies with framing; large deviations must remain detectable.
      assert.ok([neck, shoulder].some(policy => scorePosture(transformed.delta, policy).score < 100));
    }
  }
});

test('reference shoulder slope is retained as a personal reference, not an absolute camera level', () => {
  const baseline = reference({ tilt: .04 });
  const same = advanceObservation(createObservation(), baseline, frame(3100, { tilt: .04, scale: 1.2 }));
  close(scorePosture(same.delta, shoulder).score, 100);
  const changed = advanceObservation(createObservation(), baseline, frame(3100, { tilt: -.04 }));
  assert.ok(scorePosture(changed.delta, shoulder).score < 100);
});

test('motion protection agrees for identical physical motion at different resolutions', () => {
  const results = [];
  for (const resolutionScale of [.5, 1, 2]) {
    const baseline = reference();
    baseline.widthPx *= resolutionScale; baseline.heightPx *= resolutionScale;
    baseline.baseEarSpanPx *= resolutionScale; baseline.baseShoulderSpanPx *= resolutionScale; baseline.baseEarHeightPx *= resolutionScale;
    const make = (at, shiftY) => {
      const input = frame(at, { shiftY }); input.widthPx *= resolutionScale; input.heightPx *= resolutionScale; return input;
    };
    const first = advanceObservation(createObservation(), baseline, make(3100, 0));
    const moved = advanceObservation(first, baseline, make(3200, .04));
    close(moved.velocityShoulderWidthsPerSecond, .8);
    const initial = advanceEvaluation(createEvaluation(neck), first, neck);
    results.push(advanceEvaluation(initial, moved, neck).protection);
  }
  assert.deepEqual(results, ['moving', 'moving', 'moving']);
});

test('one-frame spikes are removed but a sustained deviation appears on its second frame', () => {
  const baseline = reference();
  let state = createObservation();
  for (const at of [3100, 3200, 3300]) state = advanceObservation(state, baseline, frame(at));
  state = advanceObservation(state, baseline, frame(3400, { slump: .1 }));
  close(state.delta.neckSlump, 0);
  state = advanceObservation(state, baseline, frame(3500, { slump: .1 }));
  close(state.delta.neckSlump, .2);
  const missing = advanceObservation(state, baseline, { ...frame(3600), landmarks: undefined });
  assert.equal(missing.delta, null); assert.deepEqual(missing.deltaWindow, []);
  const resumed = advanceObservation(missing, baseline, frame(3700));
  close(resumed.delta.neckSlump, 0); close(resumed.observedSeconds, state.observedSeconds);
});

test('filter history never bridges changed references, long gaps or low confidence', () => {
  const baseline = reference();
  let state = createObservation();
  for (const at of [3100, 3200, 3300]) state = advanceObservation(state, baseline, frame(at, { slump: .1 }));
  for (const [ref, input] of [[{ ...baseline, completedAtMs: 3400 }, frame(3400)], [baseline, frame(4000)]]) {
    const next = advanceObservation(state, ref, input);
    close(next.delta.neckSlump, 0); assert.equal(next.deltaWindow.length, 1);
  }
  const low = frame(3400); low.landmarks[7].visibility = .2;
  const next = advanceObservation(state, baseline, low);
  assert.equal(next.delta, null); assert.equal(next.deltaWindow.length, 0);
});

test('rotated torso depth evidence blocks calibration and scores without fabricating good posture', () => {
  const input = frame(3100);
  input.worldLandmarks = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
  input.worldLandmarks[11] = { x: .1, y: 0, z: .2 };
  input.worldLandmarks[12] = { x: -.1, y: 0, z: -.2 };
  assert.equal(extractFrontalMeasurement(input).reason, 'body-turned');
  assert.equal(advanceCalibration(createCalibration(), input).progress, 0);
  const observed = advanceObservation(createObservation(), reference(), input);
  assert.equal(observed.delta, null); assert.equal(observed.observedSeconds, 0);
  assert.equal(extractFrontalMeasurement({ ...input, worldLandmarks: undefined }).valid, true);
});
