import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceCalibration, createCalibration } from '../src/features/posture/calibration.ts';
import { advanceObservation, createObservation, interruptObservation } from '../src/features/posture/observation.ts';

function frame(timestampMs, overrides = {}) {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  landmarks[0] = { x: 0.5, y: 0.25, visibility: 1 };
  landmarks[11] = { x: 0.75, y: 0.5, visibility: 1 };
  landmarks[12] = { x: 0.25, y: 0.5, visibility: 1 };
  return { landmarks, widthPx: 1000, heightPx: 1000, sourceId: 'camera-one', timestampMs, ...overrides };
}

function reference() {
  let calibration = createCalibration();
  for (let at = 0; at <= 3000; at += 100) calibration = advanceCalibration(calibration, frame(at));
  return calibration.reference;
}

test('replaying identical observations returns identical results without mutating inputs', () => {
  const baseline = reference();
  const frames = [frame(3000), frame(3100), frame(3200, { landmarks: undefined }), frame(3300), frame(3500)];
  const before = structuredClone({ baseline, frames });
  const initial = createObservation();
  const replay = () => frames.reduce((state, input) => advanceObservation(state, baseline, input), initial);
  assert.deepEqual(replay(), replay());
  assert.deepEqual({ baseline, frames }, before);
  assert.deepEqual(initial, createObservation());
  assert.ok(Math.abs(replay().observedSeconds - 0.3) < 1e-12);
});

test('calibration time and first valid frame add no observed duration', () => {
  const pending = advanceObservation(createObservation(), null, frame(2900));
  assert.equal(pending.delta, null);
  const first = advanceObservation(pending, reference(), frame(3000));
  assert.equal(first.observedSeconds, 0);
  assert.deepEqual(first.delta, {
    noseOffsetShoulderWidths: 0, noseHeightShoulderWidths: 0, shoulderHeightDifferenceShoulderWidths: 0,
  });
  assert.equal(advanceObservation(first, reference(), frame(3100)).observedSeconds, 0.1);
});

test('missing and low-confidence observations clear values and break time continuity', () => {
  const baseline = reference();
  const first = advanceObservation(createObservation(), baseline, frame(3000));
  const observed = advanceObservation(first, baseline, frame(3100));
  const lowConfidence = frame(3200);
  lowConfidence.landmarks[0].visibility = 0.6999;
  for (const missing of [frame(3200, { landmarks: undefined }), lowConfidence, frame(3200, { widthPx: 0 })]) {
    const unavailable = advanceObservation(observed, baseline, missing);
    assert.equal(unavailable.delta, null);
    assert.equal(unavailable.observedSeconds, 0.1);
    const resumed = advanceObservation(unavailable, baseline, frame(3300));
    assert.equal(resumed.observedSeconds, 0.1);
    assert.equal(advanceObservation(resumed, baseline, frame(3400)).observedSeconds, 0.2);
  }
});

test('only positive consecutive gaps at or below 500ms count, without capping long gaps', () => {
  const baseline = reference();
  const first = advanceObservation(createObservation(), baseline, frame(3000));
  for (const gap of [499, 500, 501, 10000]) {
    const next = advanceObservation(first, baseline, frame(3000 + gap));
    assert.equal(next.observedSeconds, gap <= 500 ? gap / 1000 : 0);
    assert.notEqual(next.delta, null);
  }
});

test('duplicate, reversed and nonfinite times cannot subtract or double-count duration', () => {
  const baseline = reference();
  const first = advanceObservation(createObservation(), baseline, frame(3000));
  const observed = advanceObservation(first, baseline, frame(3100));
  for (const timestampMs of [3100, 3050, -1, NaN, Infinity]) {
    const invalid = advanceObservation(observed, baseline, frame(timestampMs));
    assert.equal(invalid.observedSeconds, 0.1);
    assert.equal(invalid.delta, null);
    assert.equal(invalid.reason, 'invalid-time');
    const replayed = advanceObservation(invalid, baseline, frame(3075));
    assert.equal(replayed.reason, 'invalid-time');
    assert.equal(advanceObservation(replayed, baseline, frame(3200)).observedSeconds, 0.1);
  }
});

test('stream interruption, camera replacement and a new reference do not join old intervals', () => {
  const baseline = reference();
  const first = advanceObservation(createObservation(), baseline, frame(3000));
  const interrupted = interruptObservation(first);
  assert.equal(interrupted.delta, null);
  assert.equal(advanceObservation(interrupted, baseline, frame(3100)).observedSeconds, 0);
  for (const changed of [frame(3100, { sourceId: 'camera-two' }), frame(3100, { widthPx: 640 })]) {
    const invalid = advanceObservation(first, baseline, changed);
    assert.equal(invalid.reason, 'camera-changed');
    assert.equal(invalid.delta, null);
    assert.equal(invalid.observedSeconds, 0);
  }
  assert.equal(advanceObservation(first, { ...baseline, completedAtMs: 3100 }, frame(3100)).observedSeconds, 0);
  assert.equal(advanceObservation(createObservation(), baseline, frame(2999)).reason, 'invalid-time');
});

test('signed projected differences are distinct from scores and anatomical diagnoses', () => {
  const baseline = reference();
  const moved = frame(3100);
  moved.landmarks[0].x += 0.125;
  const result = advanceObservation(createObservation(), baseline, moved);
  assert.equal(result.delta.noseOffsetShoulderWidths, 0.25);
  assert.equal(result.delta.noseHeightShoulderWidths, 0);
  // A very different stable pose can itself become a zero-difference reference.
  let calibration = createCalibration();
  for (let at = 0; at <= 3000; at += 100) {
    calibration = advanceCalibration(calibration, { ...moved, timestampMs: at });
  }
  const matching = advanceObservation(createObservation(), calibration.reference, moved);
  assert.equal(matching.delta.noseOffsetShoulderWidths, 0);
  for (const key of ['score', 'diagnosis', 'isCorrect', 'isResting', 'misuse']) assert.equal(key in matching, false);
});

test('monotonic observation time crosses wall-clock midnight without a duration reset', () => {
  const baseline = reference();
  // 23:59:59.750 and 00:00:00.250 correspond to capture times 3000 and 3500.
  const wallStart = Date.parse('2026-09-12T23:59:56.750+09:00');
  const beforeMidnight = Date.parse('2026-09-12T23:59:59.750+09:00') - wallStart;
  const afterMidnight = Date.parse('2026-09-13T00:00:00.250+09:00') - wallStart;
  const first = advanceObservation(createObservation(), baseline, frame(beforeMidnight));
  assert.equal(advanceObservation(first, baseline, frame(afterMidnight)).observedSeconds, 0.5);
});
