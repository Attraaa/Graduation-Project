import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceObservation, createObservation } from '../src/features/posture/observation.ts';
import { scorePosture } from '../src/features/posture/scoring.ts';
import { shoulderScorePolicy as policy } from '../src/features/posture/modes/shoulder.ts';
const rad = degrees => degrees * Math.PI / 180;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const score = degrees => scorePosture({ headForward: 0, torsoForward: 0, neckSlump: 0, shoulderTilt: rad(degrees), shoulderShrug: 0, yawRatio: 0 }, policy).score;

test('small projected tilt stays tolerant and decline steepens continuously after four degrees', () => {
  for (const degrees of [0, 1, 2, 3]) close(score(degrees), 100);
  close(score(4), 95.0726560800889);
  close(score(4 - 1e-9), score(4)); close(score(4 + 1e-9), score(4));
  assert.ok(score(6) < 64 && score(6) > 62);
  assert.ok(score(8) < 22 && score(8) > 20);
  close(score(10), 0);
  close(score(12), 0);
  assert.ok(score(4) - score(6) < score(6) - score(8));
  let previous = 100;
  for (let deg = 0; deg <= 180; deg += .1) { const next = score(deg); assert.ok(next <= previous && next >= 0); previous = next; }
});

test('observation measures reference-relative projected angle for either direction, not sine difference', () => {
  for (const baseline of [-10, 0, 10]) for (const change of [-8, 8]) {
    const angle = rad(baseline + change);
    const landmarks = Array.from({ length: 33 }, () => ({ x: .5, y: .25, visibility: 1 }));
    landmarks[7].x = .6; landmarks[8].x = .4;
    landmarks[11] = { x: .5 + .25 * Math.cos(angle), y: .5 + .25 * Math.sin(angle), visibility: 1 };
    landmarks[12] = { x: .5 - .25 * Math.cos(angle), y: .5 - .25 * Math.sin(angle), visibility: 1 };
    const reference = { schemaVersion: 2, sourceId: 'cam', widthPx: 1000, heightPx: 1000, completedAtMs: 0,
      baseEarSpanPx: 200, baseShoulderSpanPx: 500, baseEarHeightPx: 250,
      metrics: { shoulderHeightDifferenceShoulderWidths: Math.sin(rad(baseline)) } };
    const result = advanceObservation(createObservation(), reference, { landmarks, widthPx: 1000, heightPx: 1000, sourceId: 'cam', timestampMs: 0 });
    close(result.delta.shoulderTilt, rad(8));
  }
});
