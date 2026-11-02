import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { advanceCalibration, createCalibration, extractFrontalMeasurement } from '../src/features/posture/calibration.ts';
import { advanceObservation, createObservation } from '../src/features/posture/observation.ts';
import { scorePosture } from '../src/features/posture/scoring.ts';
import { turtleScorePolicy as neck } from '../src/features/posture/modes/turtle.ts';
import { shoulderScorePolicy as shoulder } from '../src/features/posture/modes/shoulder.ts';
import {
  VIEW_CALIBRATION, advanceViewCalibration, chooseReference, createViewCalibration, currentViewTarget, interruptViewCalibration, skipViewTarget,
} from '../src/features/posture/viewReferences.ts';

const close = (a, b, epsilon = 1e-9) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
/**
 * Head turned by `yaw` degrees around the vertical axis: ears at ±r·cos(yaw), nose d·sin(yaw) ahead (r = d = 0.1),
 * so the signed yaw ratio is 0.5·tan(yaw). Shoulders stay put. `drop` lowers the head; `earScale` widens the ears.
 */
function frame(timestampMs, { yaw = 0, drop = 0, earScale = 1, visibility = 1 } = {}) {
  const angle = yaw * Math.PI / 180, half = 0.1 * Math.cos(angle) * earScale, y = 0.25 + drop;
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  landmarks[0] = { x: 0.5 + 0.1 * Math.sin(angle), y, visibility };
  landmarks[7] = { x: 0.5 + half, y, visibility: 0.99 };
  landmarks[8] = { x: 0.5 - half, y, visibility: 0.99 };
  landmarks[11] = { x: 0.75, y: 0.5, visibility: 1 };
  landmarks[12] = { x: 0.25, y: 0.5, visibility: 1 };
  return { landmarks, widthPx: 1000, heightPx: 1000, sourceId: 'camera-one', timestampMs };
}
const left = { id: 'display:2', label: '왼쪽 모니터' };
const right = { id: 'display:3', label: '오른쪽 모니터' };
function frontReference() {
  let calibration = createCalibration();
  for (let at = 0; at <= 3000; at += 100) calibration = advanceCalibration(calibration, frame(at));
  return calibration.reference;
}
function collect(state, front, from, to, input, step = 100) {
  for (let at = from; at <= to; at += step) state = advanceViewCalibration(state, typeof input === 'function' ? input(at) : frame(at, input), front);
  return state;
}
function sideReference(front, yaw = 30, target = left) {
  return collect(createViewCalibration([target]), front, 3100, 6200, { yaw }).references[0];
}
const scores = delta => [scorePosture(delta, neck).score, scorePosture(delta, shoulder).score];

test('the measurement keeps the size and the direction of the head turn', () => {
  const turned = extractFrontalMeasurement(frame(0, { yaw: 30 })).measurement;
  close(turned.yawSigned, 0.5 * Math.tan(Math.PI / 6), 1e-12);
  close(turned.yawRatio, Math.abs(turned.yawSigned), 1e-12);
  assert.ok(extractFrontalMeasurement(frame(0, { yaw: -30 })).measurement.yawSigned < 0);
  close(frontReference().yawSigned, 0, 1e-12);
});

test('a side reference is collected only after the head turns away from the front reference', () => {
  const front = frontReference();
  let state = collect(createViewCalibration([left, right]), front, 3100, 6000, { yaw: 5 });
  assert.deepEqual([state.calibration.reason, state.calibration.progress, state.references.length], ['facing-front', 0, 0]);
  state = collect(state, front, 6100, 9200, { yaw: 30 });
  assert.equal(state.references.length, 1);
  assert.deepEqual(state.references[0].view, left);
  close(state.references[0].yawSigned, 0.5 * Math.tan(Math.PI / 6), 1e-12);
  assert.deepEqual(state.results, [{ ...left, status: 'ready', reason: null }]);
  assert.deepEqual(currentViewTarget(state), right, 'the next monitor follows');
  state = collect(state, front, 9300, 12400, { yaw: -32 });
  assert.equal(state.references.length, 2);
  assert.equal(currentViewTarget(state), null);
  assert.equal(advanceViewCalibration(state, frame(12500, { yaw: 30 }), front), state, 'nothing left to collect');
});

test('a side monitor that cannot be collected fails after the timeout, and one can be skipped', () => {
  const front = frontReference();
  const hidden = collect(createViewCalibration([left]), front, 3100, 3100 + VIEW_CALIBRATION.timeoutMs + 100, { yaw: 35, visibility: 0.5 });
  assert.deepEqual(hidden.results, [{ ...left, status: 'failed', reason: 'low-confidence' }]);
  assert.equal(hidden.references.length, 0);
  const silent = collect(createViewCalibration([left]), front, 3100, 3100 + VIEW_CALIBRATION.timeoutMs + 100, { yaw: 2 });
  assert.deepEqual(silent.results, [{ ...left, status: 'failed', reason: 'facing-front' }]);
  // A pause restarts the current monitor, so paused time never counts toward its timeout.
  let paused = collect(createViewCalibration([left]), front, 3100, 4000, { yaw: 30 });
  assert.ok(paused.calibration.progress > 0);
  paused = interruptViewCalibration(paused);
  assert.deepEqual([paused.startedAtMs, paused.calibration.progress], [null, 0]);
  paused = collect(paused, front, 60000, 63100, { yaw: 30 });
  assert.deepEqual(paused.results, [{ ...left, status: 'ready', reason: null }]);
  const skipped = skipViewTarget(createViewCalibration([left, right]));
  assert.deepEqual([skipped.results, currentViewTarget(skipped)], [[{ ...left, status: 'skipped', reason: null }], right]);
  assert.equal(skipViewTarget(skipped).results.length, 2);
});

test('each frame is compared with the reference of the nearest head direction', () => {
  const front = frontReference(), side = sideReference(front);
  const measure = yaw => extractFrontalMeasurement(frame(0, { yaw })).measurement;
  assert.equal(chooseReference(front, [side], measure(0)), front);
  assert.equal(chooseReference(front, [side], measure(12)), front);
  assert.equal(chooseReference(front, [side], measure(20)), side);
  assert.equal(chooseReference(front, [side], measure(45)), side);
  assert.equal(chooseReference(front, [], measure(30)), front);
});

test('looking at a side monitor is scored against its own reference instead of being held', () => {
  const front = frontReference(), side = sideReference(front);
  const held = advanceObservation(createObservation(), front, frame(6300, { yaw: 30 }));
  assert.deepEqual([held.reason, held.delta], ['head-turned', null], 'without a side reference nothing changes');
  const scored = advanceObservation(createObservation(), front, frame(6300, { yaw: 30 }), [side]);
  assert.equal(scored.reason, null);
  assert.deepEqual(scored.reference.view, left);
  assert.deepEqual(scores(scored.delta), [100, 100]);
  const frontal = advanceObservation(createObservation(), front, frame(6300), [side]);
  assert.equal(frontal.reference, front);
  assert.deepEqual(scores(frontal.delta), [100, 100]);
  for (const yaw of [45, -30]) {
    const turned = advanceObservation(createObservation(), front, frame(6300, { yaw }), [side]);
    assert.deepEqual([turned.reason, turned.delta], ['head-turned', null], `yaw ${yaw}`);
  }
});

test('a side reference ignores rotation-driven ear width but still detects a lowered head', () => {
  const front = frontReference(), side = sideReference(front);
  // 10 degrees less turn widens the projected ears by about 9%; that is rotation, not forward movement.
  const lessTurned = advanceObservation(createObservation(), front, frame(6300, { yaw: 20 }), [side]);
  assert.equal(lessTurned.reference, side);
  close(lessTurned.delta.headForward, 0);
  assert.deepEqual(scores(lessTurned.delta), [100, 100]);
  // The same width growth still counts at the front reference, where rotation cannot explain it.
  const frontWider = advanceObservation(createObservation(), front, frame(6300, { earScale: Math.cos(Math.PI / 9) / Math.cos(Math.PI / 6) }), [side]);
  assert.equal(frontWider.reference, front);
  assert.ok(frontWider.delta.headForward > 0.15);
  const slumped = advanceObservation(createObservation(), front, frame(6300, { yaw: 30, drop: 0.08 }), [side]);
  close(slumped.delta.neckSlump, 0.16, 1e-9);
  assert.ok(scorePosture(slumped.delta, neck).score < 90);
});

test('switching between references never joins observed time across the switch', () => {
  const front = frontReference(), side = sideReference(front);
  let state = createObservation();
  for (let at = 6300; at <= 6700; at += 100) state = advanceObservation(state, front, frame(at), [side]);
  close(state.observedSeconds, 0.4);
  for (let at = 6800; at <= 7200; at += 100) state = advanceObservation(state, front, frame(at, { yaw: 30 }), [side]);
  close(state.observedSeconds, 0.8);
  state = advanceObservation(state, front, frame(7300), [side]);
  close(state.observedSeconds, 0.8);
});

const bundle = await build({ entryPoints: ['src/features/posture/ViewReferenceGuide.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const guide = collecting => renderToStaticMarkup(createElement(compiled.exports.default, { collecting, onSkip() {} })).replace(/<[^>]+>/g, '');

test('the guide explains each side-monitor collection step', () => {
  assert.equal(guide(null), '');
  const base = { ...left, index: 0, total: 1, progress: 0.4, reason: null, waiting: false };
  assert.match(guide({ ...base, waiting: true }), /깜빡임 보정이 끝나면 왼쪽 모니터 기준 자세를 모읍니다/);
  assert.match(guide(base), /1\/1 · 왼쪽 모니터를 보며 바른 자세를 잠시 유지해 주세요/);
  assert.match(guide({ ...base, reason: 'facing-front' }), /아직 정면 모니터를 보고 있습니다. 왼쪽 모니터 쪽으로 고개를 돌려 주세요/);
  assert.match(guide({ ...base, reason: 'low-confidence' }), /귀와 어깨가 잘 보이지 않습니다/);
  assert.match(guide(base), /이 모니터 건너뛰기/);
});
