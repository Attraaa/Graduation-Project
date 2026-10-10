import assert from 'node:assert/strict';
import test from 'node:test';
import { createEyeMeasurement } from '../src/features/eye/measurement.ts';
import { eyePolicy, eyePolicyVersion, isCurrentEyePolicy } from '../src/features/eye/eyePolicy.ts';
import { readEyes } from '../src/features/eye/observation.ts';

const open = Object.freeze({ left: 0.05, right: 0.1, faceWidth: 0.3 });
// A lower right-eye coefficient represents an asymmetric model signal, not a wink.
const asymmetricClosed = Object.freeze({ ...open, left: 0.8, right: 0.45 });

function driver(sensitivity = 'normal', first = open) {
  const engine = createEyeMeasurement(sensitivity);
  let now = 0;
  let state = engine.sample(now, first);
  return {
    engine,
    step(observation = open, dt = 50) {
      now += dt;
      state = engine.sample(now, observation);
      return state;
    },
    get state() { return state; },
    get now() { return now; },
  };
}

function distanceReference(f) {
  for (let i = 0; i < 60; i++) f.step();
  assert.equal(f.state.calibrationPhase, 'eyes');
  assert.equal(f.state.calibrated, false);
  return f;
}

function guidedBlink(f, closed = asymmetricClosed) {
  f.step(); f.step(closed); f.step(closed);
  return f.step();
}

function calibrated(sensitivity = 'normal') {
  const f = distanceReference(driver(sensitivity));
  for (let i = 0; i < 3; i++) guidedBlink(f);
  assert.equal(f.state.calibrationPhase, 'ready');
  assert.equal(f.state.calibrated, true);
  assert.equal(f.state.calibrationBlinks, 3);
  assert.equal(f.state.blinks, 0);
  assert.equal(f.state.validMs, 0);
  return f;
}

test('startup requires an open reference and three guided bilateral blinks before measurement', () => {
  const f = driver();
  assert.equal(f.state.calibrationPhase, 'distance');
  assert.equal(f.state.calibrationBlinks, 0);
  for (let i = 0; i < 59; i++) f.step();
  assert.equal(f.state.calibrationPhase, 'distance');
  f.step();
  assert.equal(f.state.calibrationPhase, 'eyes');
  for (let i = 1; i <= 3; i++) {
    f.step(); f.step(asymmetricClosed); f.step(asymmetricClosed);
    assert.equal(f.state.calibrationBlinks, i - 1);
    const reopened = f.step();
    assert.equal(reopened.calibrationBlinks, i);
    assert.equal(reopened.calibrated, i === 3);
    assert.equal(reopened.calibrationPhase, i === 3 ? 'ready' : 'eyes');
    assert.equal(reopened.blinks, 0);
    assert.equal(reopened.validMs, 0);
    assert.equal(reopened.blinksPerMinute, null);
    assert.equal(reopened.recentBlinksPerMinute, null);
  }
  assert.equal(f.step().validMs, 50);
});

test('a blocked closed eye from startup cannot become an open-eye reference', () => {
  for (const blocked of [{ ...open, left: 0.9 }, { ...open, left: 0.9, right: 0.9 }]) {
    const f = driver('normal', blocked);
    for (let i = 0; i < 100; i++) f.step(blocked);
    assert.equal(f.state.calibrationPhase, 'distance');
    assert.equal(f.state.calibrated, false);
    assert.equal(f.state.calibrationBlinks, 0);
    assert.equal(f.state.blinks, 0);
    assert.equal(f.state.validMs, 0);
    // Removing the obstruction still requires a complete fresh reference.
    f.step();
    for (let i = 0; i < 59; i++) f.step();
    assert.equal(f.state.calibrationPhase, 'distance');
    assert.equal(f.step().calibrationPhase, 'eyes');
  }
});

test('one eye with insufficient open-to-closed separation cannot finish guided calibration', () => {
  const f = distanceReference(driver());
  const weakRight = { ...asymmetricClosed, right: 0.22 };
  for (let i = 0; i < 5; i++) guidedBlink(f, weakRight);
  assert.equal(f.state.calibrationPhase, 'eyes');
  assert.equal(f.state.calibrationBlinks, 0);
  assert.equal(f.state.calibrated, false);
  assert.equal(f.state.validMs, 0);
  for (let i = 0; i < 3; i++) guidedBlink(f);
  assert.equal(f.state.calibrationPhase, 'ready');
  assert.equal(f.state.blinks, 0);
});

test('learned per-eye references count asymmetric bilateral signals and keep both wink directions excluded', () => {
  const f = calibrated();
  guidedBlink(f);
  assert.equal(f.state.blinks, 1);
  for (const wink of [{ ...open, left: 0.8 }, { ...open, right: 0.45 }]) {
    guidedBlink(f, wink);
    assert.equal(f.state.blinks, 1);
  }
  guidedBlink(f);
  assert.equal(f.state.blinks, 2);
});

test('alternating one-eye winks without overlapping bilateral closure never count or calibrate', () => {
  const leftOnly = { ...open, left: 0.8 }, rightOnly = { ...open, right: 0.45 };
  for (const f of [calibrated(), distanceReference(driver())]) {
    f.step();
    for (let i = 0; i < 4; i++) { f.step(leftOnly); f.step(rightOnly); }
    assert.equal(f.step().blinks, 0);
    assert.equal(f.state.calibrationBlinks, f.state.calibrated ? 3 : 0);
    if (!f.state.calibrated) assert.equal(f.state.calibrationPhase, 'eyes');
  }
});

test('confirmed bilateral closure allows staggered closing and reopening in measurement and calibration', () => {
  const leftOnly = { ...open, left: 0.8 }, rightOnly = { ...open, right: 0.45 };
  for (const frames of [
    [leftOnly, asymmetricClosed, rightOnly],
    [rightOnly, asymmetricClosed, leftOnly],
    [asymmetricClosed, leftOnly],
    [asymmetricClosed, rightOnly],
  ]) {
    const f = calibrated();
    f.step();
    for (const frame of frames) f.step(frame);
    assert.equal(f.step().blinks, 1);
    assert.equal(f.step().blinks, 1, 'the same cycle still counts only once');
    const calibration = distanceReference(driver());
    for (let i = 0; i < 3; i++) {
      calibration.step();
      for (const frame of frames) calibration.step(frame);
      assert.equal(calibration.step().calibrationBlinks, i + 1);
      assert.equal(calibration.state.blinks, 0);
      assert.equal(calibration.state.validMs, 0);
    }
    assert.equal(calibration.state.calibrationPhase, 'ready');
  }
});

test('sensitivity presets change controlled borderline recognition without relaxing bilateral detection', () => {
  const cases = [
    { closed: { ...open, left: 0.5, right: 0.31 }, counts: { low: 0, normal: 1, high: 1 } },
    { closed: { ...open, left: 0.4, right: 0.26 }, counts: { low: 0, normal: 0, high: 1 } },
  ];
  for (const { closed, counts } of cases) {
    for (const sensitivity of ['low', 'normal', 'high']) {
      const f = calibrated(sensitivity);
      guidedBlink(f, closed);
      assert.equal(f.state.blinks, counts[sensitivity], `${sensitivity}: ${JSON.stringify(closed)}`);
      const before = f.state.blinks;
      guidedBlink(f, { ...closed, right: open.right });
      assert.equal(f.state.blinks, before, `${sensitivity} must still reject a wink`);
    }
  }
});

test('a strong single closed frame at 33 ms counts but sub-25 ms noise and weak single-frame spikes do not', () => {
  for (const [duration, expected] of [[24, 0], [25, 1], [33, 1]]) {
    const f = calibrated();
    f.step(); f.step(asymmetricClosed);
    assert.equal(f.step(open, duration).blinks, expected, `${duration} ms strong single frame`);
    assert.equal(f.step().blinks, expected, 'remaining open cannot count the same cycle twice');
  }
  const f = calibrated();
  f.step(); f.step({ ...open, left: 0.5, right: 0.31 });
  assert.equal(f.step(open, 33).blinks, 0);
  guidedBlink(f, { ...open, left: 0.5, right: 0.31 });
  assert.equal(f.state.blinks, 1, 'a sustained bilateral borderline signal remains eligible');
});

test('a sustained closure beyond 700 ms is excluded without excluding a 700 ms blink', () => {
  for (const [lastInterval, expected] of [[100, 1], [101, 0]]) {
    const f = calibrated();
    f.step(); f.step(asymmetricClosed);
    for (let i = 0; i < 3; i++) f.step(asymmetricClosed, 200);
    assert.equal(f.step(open, lastInterval).blinks, expected);
  }
});

test('249 and 250 ms gaps remain observed; a 251 ms gap cancels the pending blink and excludes its time', () => {
  for (const gap of [249, 250, 251]) {
    const f = calibrated();
    f.step();
    const before = f.step(asymmetricClosed);
    const after = f.step(open, gap);
    assert.equal(after.blinks, gap <= 250 ? 1 : 0, `${gap} ms`);
    assert.equal(after.validMs, before.validMs + (gap <= 250 ? gap : 0), `${gap} ms`);
    guidedBlink(f);
    assert.equal(f.state.blinks, gap <= 250 ? 2 : 1, 'a fresh cycle can recover after the gap');
  }
});

test('tracking loss cancels an incomplete calibration cycle while preserving completed guided blinks', () => {
  for (const loss of ['missing', 'gap']) {
    const f = distanceReference(driver());
    guidedBlink(f);
    assert.equal(f.state.calibrationBlinks, 1);
    f.step(asymmetricClosed);
    if (loss === 'missing') f.step(null);
    else f.step(asymmetricClosed, 251);
    assert.equal(f.step().calibrationBlinks, 1);
    assert.equal(f.state.calibrated, false);
    assert.equal(f.state.blinks, 0);
    assert.equal(f.state.validMs, 0);
    guidedBlink(f); guidedBlink(f);
    assert.equal(f.state.calibrationPhase, 'ready');
    assert.equal(f.state.calibrationBlinks, 3);
    assert.equal(f.state.blinks, 0);
  }
});

test('distance-only recalibration reuses learned asymmetric eyes; eye recalibration requires three fresh cycles and preserves totals', () => {
  const f = calibrated();
  guidedBlink(f);
  const before = f.state;
  const reset = f.engine.recalibrate();
  assert.equal(reset.calibrationPhase, 'distance');
  assert.equal(reset.calibrationBlinks, 3);
  assert.equal(reset.blinks, before.blinks);
  assert.equal(reset.validMs, before.validMs);
  const newView = { ...open, faceWidth: 0.5 };
  for (let i = 0; i <= 60; i++) f.step(newView);
  assert.equal(f.state.calibrationPhase, 'ready');
  assert.equal(f.state.validMs, before.validMs);
  f.step(newView);
  f.step({ ...asymmetricClosed, faceWidth: 0.5 });
  f.step({ ...asymmetricClosed, faceWidth: 0.5 });
  assert.equal(f.step(newView).blinks, 2);
  const eyeBefore = f.state;
  const eyeReset = f.engine.recalibrateEyes();
  assert.equal(eyeReset.calibrationPhase, 'distance');
  assert.equal(eyeReset.calibrationBlinks, 0);
  assert.equal(eyeReset.blinks, eyeBefore.blinks);
  assert.equal(eyeReset.validMs, eyeBefore.validMs);
  for (let i = 0; i <= 60; i++) f.step();
  assert.equal(f.state.calibrationPhase, 'eyes');
  for (let i = 0; i < 3; i++) guidedBlink(f);
  assert.equal(f.state.calibrationPhase, 'ready');
  assert.equal(f.state.blinks, eyeBefore.blinks);
  assert.equal(f.state.validMs, eyeBefore.validMs);
});

function modelResult(cheeks = [0.3, 0.7], eyes = [0.4, 0.6]) {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  for (const [id, x, y] of [
    [33, eyes[0], 0.4], [263, eyes[1], 0.4], [1, (eyes[0] + eyes[1]) / 2, 0.5],
    [10, 0.5, 0.2], [152, 0.5, 0.8], [234, cheeks[0], 0.5], [454, cheeks[1], 0.5],
  ]) points[id] = { x, y };
  return { faceLandmarks: [points], faceBlendshapes: [{ categories: [
    { categoryName: 'eyeBlinkLeft', score: open.left },
    { categoryName: 'eyeBlinkRight', score: open.right },
  ] }] };
}

test('small-face and eye-span quality boundaries remain independent of blink sensitivity', () => {
  const cases = [
    [modelResult([0.4405, 0.5595]), false], // Face width 0.119.
    [modelResult([0.44, 0.56]), true], // Face width 0.12, represented just above its binary boundary.
    [modelResult(undefined, [0.47, 0.524]), false], // Eye span 0.054.
    [modelResult(undefined, [0.47, 0.525]), true], // Eye span 0.055.
  ];
  for (const [result, accepted] of cases) {
    const reading = readEyes(result, 1280, 720);
    assert.equal(reading.observation !== null, accepted);
    if (!accepted) {
      assert.match(reading.reason, /작게/);
      for (const sensitivity of ['low', 'normal', 'high']) {
        const f = calibrated(sensitivity);
        f.step(); f.step(asymmetricClosed);
        const before = f.state.validMs;
        assert.equal(f.step(reading.observation).validMs, before);
        assert.equal(f.step().blinks, 0);
      }
    }
  }
});

test('each sensitivity has a distinct current policy identity; legacy and unknown policies remain separate', () => {
  const versions = ['low', 'normal', 'high'].map(eyePolicyVersion);
  assert.equal(new Set(versions).size, 3);
  assert.equal(eyePolicy.version, eyePolicyVersion('normal'));
  for (const version of versions) assert.equal(isCurrentEyePolicy(version), true);
  assert.equal(isCurrentEyePolicy('eye-habits-v2'), false);
  assert.equal(isCurrentEyePolicy('eye-habits-v3:unknown'), false);
  assert.equal(isCurrentEyePolicy(''), false);
});
