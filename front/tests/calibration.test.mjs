import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceCalibration,
  createCalibration,
  DEFAULT_CALIBRATION_OPTIONS,
  extractFrontalMeasurement,
} from '../src/features/posture/calibration.ts';

function frame(timestampMs, overrides = {}) {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.99 }));
  landmarks[0] = { x: 0.5, y: 0.25, visibility: 0.99 };
  landmarks[11] = { x: 0.7, y: 0.6, visibility: 0.99 };
  landmarks[12] = { x: 0.3, y: 0.6, visibility: 0.99 };
  return { landmarks, widthPx: 1280, heightPx: 720, sourceId: 'camera-one', timestampMs, ...overrides };
}

function collect(from = 0, until = 3000, state = createCalibration(), transform = value => value, options) {
  for (let timestampMs = from; timestampMs <= until; timestampMs += 100) {
    state = advanceCalibration(state, transform(frame(timestampMs)), options);
  }
  return state;
}

test('converts each coordinate dimension to pixels before calculating shoulder-relative metrics', () => {
  const wide = frame(0);
  const square = frame(0, {
    widthPx: 1280,
    heightPx: 1280,
    landmarks: wide.landmarks.map(point => ({ ...point, y: point.y * 720 / 1280 })),
  });
  const a = extractFrontalMeasurement(wide);
  const b = extractFrontalMeasurement(square);
  assert.ok(a.valid && b.valid);
  assert.equal(a.measurement.noseOffsetShoulderWidths, 0);
  assert.ok(Math.abs(a.measurement.noseHeightShoulderWidths - 252 / 512) < 1e-12);
  assert.ok(Math.abs(a.measurement.noseHeightShoulderWidths - b.measurement.noseHeightShoulderWidths) < 1e-12);
});

test('requires both continuous elapsed capture time and enough distinct samples', () => {
  const pending = collect(0, 2900);
  assert.equal(pending.phase, 'collecting');
  const ready = advanceCalibration(pending, frame(3000));
  assert.equal(ready.phase, 'ready');
  assert.equal(ready.reference.sampleCount, 31);
  const options = { ...DEFAULT_CALIBRATION_OPTIONS, minSamples: 40 };
  assert.equal(collect(0, 3000, createCalibration(), value => value, options).phase, 'collecting');
  const fast = advanceCalibration(advanceCalibration(createCalibration(), frame(0)), frame(20));
  assert.equal(fast.samples.length, 1);
});

test('uses a median so a small accepted landmark spike does not shift the reference', () => {
  const result = collect(0, 3000, createCalibration(), value => {
    if (value.timestampMs === 1000) value.landmarks[0].x += 0.02;
    return value;
  });
  assert.equal(result.phase, 'ready');
  assert.equal(result.reference.metrics.noseOffsetShoulderWidths, 0);
});

test('missing, uncertain, nonfinite and out-of-frame landmarks never become a valid zero', () => {
  const invalidFrames = [
    [frame(2100, { landmarks: undefined }), 'missing-landmarks'],
    [frame(2100, { landmarks: [] }), 'missing-landmarks'],
    [frame(2100, { widthPx: 0 }), 'invalid-frame'],
    [frame(Number.NaN), 'invalid-time'],
  ];
  for (const visibility of [undefined, 0.4, Number.NaN, 1.1]) {
    const value = frame(2100);
    value.landmarks[11].visibility = visibility;
    invalidFrames.push([value, 'low-confidence']);
  }
  for (const x of [-0.1, 1.1, Number.NaN]) {
    const value = frame(2100);
    value.landmarks[0].x = x;
    invalidFrames.push([value, 'out-of-frame']);
  }
  const tooNarrow = frame(2100);
  tooNarrow.landmarks[11].x = 0.51;
  tooNarrow.landmarks[12].x = 0.49;
  invalidFrames.push([tooNarrow, 'shoulders-too-close']);
  const pending = collect(0, 2000);
  for (const [value, expectedReason] of invalidFrames) {
    const next = advanceCalibration(pending, value);
    assert.equal(next.reason, expectedReason);
    assert.equal(next.samples.length, 0);
    assert.equal(next.reference, null);
  }
});

test('a missing frame discards earlier samples and requires a fresh full window', () => {
  let state = advanceCalibration(collect(0, 2000), frame(2100, { landmarks: undefined }));
  state = collect(2200, 5100, state);
  assert.equal(state.phase, 'collecting');
  state = advanceCalibration(state, frame(5200));
  assert.equal(state.phase, 'ready');
  assert.equal(state.reference.startedAtMs, 2200);
});

test('large movement and slow drift restart acquisition, rather than averaging different poses', () => {
  const sudden = frame(2100);
  sudden.landmarks[0].x += 0.1;
  const reset = advanceCalibration(collect(0, 2000), sudden);
  assert.equal(reset.reason, 'moving');
  assert.equal(reset.samples.length, 1);
  const drift = collect(0, 3000, createCalibration(), value => {
    value.landmarks[0].x += value.timestampMs * 0.00003;
    return value;
  });
  assert.equal(drift.phase, 'collecting');
  assert.ok(drift.samples[0].timestampMs > 0);
});

test('movement between retained samples also breaks the stable window', () => {
  const transient = frame(2050);
  transient.landmarks[0].x += 0.1;
  const next = advanceCalibration(collect(0, 2000), transient);
  assert.equal(next.reason, 'moving');
  assert.equal(next.samples.length, 1);
  assert.equal(next.samples[0].timestampMs, 2050);
});

test('camera identity, dimensions, tracking gaps and reversed time cannot join old samples', () => {
  const pending = collect(0, 2000);
  for (const changed of [frame(2100, { sourceId: 'camera-two' }), frame(2100, { widthPx: 640 })]) {
    const reset = advanceCalibration(pending, changed);
    assert.equal(reset.reason, 'camera-changed');
    assert.equal(reset.samples.length, 1);
  }
  const resumed = advanceCalibration(pending, frame(3000));
  assert.equal(resumed.reason, 'interrupted');
  assert.equal(resumed.samples.length, 1);
  for (const timestamp of [2000, 1900]) {
    assert.equal(advanceCalibration(pending, frame(timestamp)).reason, 'invalid-time');
  }
});

test('a completed reference stays fixed, but camera replacement and explicit new sessions reset it', () => {
  const ready = collect();
  assert.equal(advanceCalibration(ready, frame(3100, { landmarks: undefined })), ready);
  const replaced = advanceCalibration(ready, frame(3100, { sourceId: 'camera-two' }));
  assert.equal(replaced.phase, 'collecting');
  assert.equal(replaced.reference, null);
  assert.equal(replaced.reason, 'camera-changed');
  assert.equal(createCalibration().reference, null);
});

test('advancing state does not mutate the previous samples or caller landmarks', () => {
  const input = frame(0);
  const before = structuredClone(input);
  const initial = createCalibration();
  const next = advanceCalibration(initial, input);
  advanceCalibration(next, frame(100));
  assert.deepEqual(input, before);
  assert.equal(initial.samples.length, 0);
  assert.equal(next.samples.length, 1);
});
