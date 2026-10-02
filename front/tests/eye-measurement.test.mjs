import assert from 'node:assert/strict';
import test from 'node:test';
import { createEyeMeasurement } from '../src/features/eye/measurement.ts';
import { readEyes } from '../src/features/eye/observation.ts';
import { createBreakTimer } from '../src/features/eye/breakTimer.ts';
import { eyeCameraChanged, eyeStreamIssue } from '../src/features/eye/streamStatus.ts';

const open = { left: 0.05, right: 0.1, faceWidth: 0.3 };
const closed = { ...open, left: 0.9, right: 0.9 };
function fixture() {
  const engine = createEyeMeasurement();
  let now = 0;
  let state;
  const step = (observation = open, dt = 50) => { now += dt; state = engine.sample(now, observation); return state; };
  for (let i = 0; i <= 60; i++) step();
  assert.equal(state.calibrated, true);
  return { step, engine, get now() { return now; } };
}
test('stable three-second reference excludes calibration from blink statistics', () => {
  const f = fixture();
  assert.equal(f.step().blinks, 0);
  assert.equal(f.step().validMs, 100);
});
test('one bilateral close/open cycle counts once; a wink and long closure do not', () => {
  const f = fixture();
  f.step(); f.step(closed); f.step(closed);
  assert.equal(f.step().blinks, 1);
  for (let i = 0; i < 4; i++) f.step({ ...open, left: 0.9 });
  assert.equal(f.step().blinks, 1);
  for (let i = 0; i < 20; i++) f.step(closed);
  assert.equal(f.step().blinks, 1);
  f.step(closed); f.step(closed);
  assert.equal(f.step().blinks, 2);
});
test('tracking loss or long frame gap cancels a partial blink and does not add unknown time', () => {
  for (const lostFrame of [null, open]) {
    const f = fixture();
    f.step(); f.step(closed);
    const previous = f.step(closed);
    const next = f.step(lostFrame, 1000);
    assert.equal(next.validMs, previous.validMs);
    assert.equal(f.step().blinks, 0);
  }
});
test('invalid and reversed timestamps cannot inflate totals or create events', () => {
  const f = fixture(); const before = f.step();
  assert.deepEqual(f.engine.sample(NaN, closed), before);
  assert.deepEqual(f.engine.sample(f.now - 10, closed), before);
  assert.equal(f.step({ ...open, left: NaN }).faceScale, null);
});
test('relative-size reminder requires persistence and releases with hysteresis', () => {
  const f = fixture(); const near = { ...open, faceWidth: 0.4 };
  f.step();
  assert.equal(f.step(near).nearReminder, false); // Previous normal interval is not near time.
  for (let i = 0; i < 59; i++) assert.equal(f.step(near).nearReminder, false);
  assert.equal(f.step(near).nearReminder, true);
  assert.equal(f.step({ ...open, faceWidth: 0.36 }).nearReminder, true);
  assert.equal(f.step().nearReminder, false);
});
test('blink rate waits for enough valid time; open-eye reminder clears on loss', () => {
  const f = fixture();
  let s;
  for (let i = 0; i < 599; i++) s = f.step();
  assert.equal(s.blinksPerMinute, null);
  assert.equal(s.openReminder, true);
  assert.equal(f.step().blinksPerMinute, 0);
  assert.equal(f.step(null).openReminder, false);
  assert.equal(f.step().openReminder, false);
});
test('movement and lost frames restart incomplete calibration', () => {
  const e = createEyeMeasurement();
  for (let t = 0; t <= 2000; t += 50) e.sample(t, open);
  assert.equal(e.sample(2050, { ...open, faceWidth: 0.5 }).progress, 0);
  assert.equal(e.sample(2100, null).progress, 0);
});
function result() {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  for (const [id, x, y] of [[33,.4,.4],[263,.6,.4],[1,.5,.5],[10,.5,.2],[152,.5,.8],[234,.3,.5],[454,.7,.5]]) points[id] = { x, y };
  return { faceLandmarks: [points], faceBlendshapes: [{ categories: [
    { categoryName: 'eyeBlinkRight', score: 0.3 }, { categoryName: 'eyeBlinkLeft', score: 0.7 },
  ] }] };
}
test('model adapter uses category names; rejects multiple faces, tilt, crop and missing eye scores', () => {
  assert.deepEqual(readEyes(result(), 1280, 720).observation, { left: 0.7, right: 0.3, faceWidth: 0.39999999999999997 });
  const multi = result(); multi.faceLandmarks.push(multi.faceLandmarks[0]);
  assert.equal(readEyes(multi, 1280, 720).observation, null);
  const tilt = result(); tilt.faceLandmarks[0][33].y = .7;
  assert.equal(readEyes(tilt, 1280, 720).observation, null);
  const crop = result(); crop.faceLandmarks[0][10].y = -.1;
  assert.equal(readEyes(crop, 1280, 720).observation, null);
  const missing = result(); missing.faceBlendshapes = [];
  assert.equal(readEyes(missing, 1280, 720).observation, null);
});
test('20-minute break due time; early cancel cannot reset work or count a break', () => {
  const t = createBreakTimer(); t.tick(0);
  for (let now = 1000; now <= 1200000; now += 1000) t.tick(now);
  assert.equal(t.snapshot().due, true);
  t.start(1200000); t.tick(1201000);
  assert.equal(t.finish(1201000).completed, 0);
  assert.equal(t.snapshot().due, true);
  t.start(1201000);
  for (let now = 1202000; now <= 1221000; now += 1000) t.tick(now);
  assert.equal(t.snapshot().remainingMs, 0);
  assert.equal(t.snapshot().completed, 0); // Still requires explicit user confirmation.
  assert.equal(t.finish(1221000).completed, 1);
  assert.equal(t.snapshot().due, false);
  assert.equal(t.finish(1221000).completed, 1);
});
test('sleep does not silently complete a rest timer', () => {
  const t = createBreakTimer(); t.start(0);
  assert.equal(t.tick(60000).remainingMs, 20000);
  assert.equal(t.finish(60000).completed, 0);
});

test('recent blink rate expires old events while session totals stay intact', () => {
  const f = fixture();
  f.step(); f.step(closed); f.step(closed); f.step();
  let state;
  for (let i = 0; i < 596; i++) state = f.step();
  assert.equal(state.validMs, 30000);
  assert.equal(state.recentBlinksPerMinute, 2);
  assert.equal(state.blinksPerMinute, 2);
  for (let i = 0; i < 604; i++) state = f.step();
  assert.equal(state.recentValidMs, 60000);
  assert.equal(state.recentBlinksPerMinute, 0);
  assert.equal(state.blinks, 1);
  assert.ok(state.blinksPerMinute > 0);
});

test('rest and lost video never dilute the recent valid-time window', () => {
  const f = fixture();
  f.step(); f.step(closed); f.step(closed); f.step();
  let state;
  for (let i = 0; i < 596; i++) state = f.step();
  const before = state;
  const absent = f.step(null, 120000);
  assert.equal(absent.recentValidMs, before.recentValidMs);
  assert.equal(absent.recentBlinksPerMinute, before.recentBlinksPerMinute);
  assert.equal(f.step().recentValidMs, before.recentValidMs);
});

test('distance recalibration preserves session counts, cancels a partial blink and resets only the recent window', () => {
  const f = fixture();
  f.step(); f.step(closed); f.step(closed); f.step();
  f.step(closed);
  const before = f.step(closed);
  const reset = f.engine.recalibrate();
  assert.equal(reset.blinks, 1);
  assert.equal(reset.validMs, before.validMs);
  assert.equal(reset.calibrated, false);
  assert.equal(reset.progress, 0);
  assert.equal(reset.faceScale, null);
  assert.equal(reset.recentBlinksPerMinute, null);
  assert.equal(reset.recentValidMs, 0);
  const newView = { ...open, faceWidth: 0.5 };
  let state;
  for (let i = 0; i <= 60; i++) state = f.step(newView);
  assert.equal(state.calibrated, true);
  assert.equal(state.validMs, before.validMs);
  state = f.step(newView);
  assert.equal(state.blinks, 1);
  assert.equal(state.faceScale, 1);
  assert.equal(state.recentValidMs, 50);
  assert.equal(state.nearReminder, false);
});

test('same camera resumes the existing reference; device or resolution changes require a new one', () => {
  const original = { deviceId: 'camera-a', width: 1280, height: 720 };
  assert.equal(eyeCameraChanged(null, original), false);
  assert.equal(eyeCameraChanged(original, { ...original }), false);
  assert.equal(eyeCameraChanged(original, { ...original, deviceId: 'camera-b' }), true);
  assert.equal(eyeCameraChanged(original, { ...original, height: 480 }), true);
});

test('stream watchdog reports a missing first frame, freeze and hidden tab without mistaking model loading for a freeze', () => {
  assert.equal(eyeStreamIssue(60000, null, null, false), null);
  assert.equal(eyeStreamIssue(1000, 0, null, false), null);
  assert.match(eyeStreamIssue(1001, 0, null, false), /도착하지/);
  assert.match(eyeStreamIssue(2001, 0, 1000, false), /멈췄습니다/);
  assert.equal(eyeStreamIssue(2500, 0, 2490, false), null);
  assert.match(eyeStreamIssue(1, 0, null, true), /다른 탭/);
});
