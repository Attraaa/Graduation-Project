import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionClock } from '../src/features/session/sessionClock.ts';
import { appendTrend } from '../src/features/session/trend.ts';
import { livePressScore } from '../src/features/keyboard/liveScore.ts';
import { keyboardTotalsSummary } from '../../database/keyboard.ts';

test('two independent clocks pause/resume without resetting accrued session time', () => {
  let now = 0;
  const upper = createSessionClock(() => now), keyboard = createSessionClock(() => now);
  upper.start(); keyboard.start(); now = 1000; upper.pause(); now = 4000;
  assert.equal(upper.seconds(), 1); assert.equal(keyboard.seconds(), 4);
  upper.pause(); upper.resume(); now = 4500; upper.pause(); keyboard.pause();
  assert.equal(upper.seconds(), 1.5); assert.equal(keyboard.seconds(), 4.5);
  upper.start(); assert.equal(upper.seconds(), 0); assert.equal(keyboard.seconds(), 4.5);
});
test('live trends preserve zero, insert immediate missing/pause boundaries and stay bounded', () => {
  const point = (at, neck) => ({ at, neck, shoulder: neck, keyboard: null });
  let points = appendTrend([], point(0, 0));
  points = appendTrend(points, point(200, null));
  points = appendTrend(points, point(400, 88));
  assert.deepEqual(points.map(item => item.neck), [0, null, 88]);
  assert.equal(appendTrend(points, point(450, 90)), points);
  assert.equal(appendTrend(points, point(399, 90)), points);
  points = appendTrend(points, point(400_000, 90));
  assert.equal(points.length, 1);
});
test('single-input keyboard values use the existing 100/70/0 aggregation and never score unknown input', () => {
  assert.equal(livePressScore(null), null);
  for (const verdict of ['preferred', 'acceptable', 'nearby', 'mismatch', 'unknown']) {
    const expected = keyboardTotalsSummary({ preferred: 0, acceptable: 0, nearby: 0, mismatch: 0, unknown: 0, unsupported: 0, [verdict]: 1 }).score;
    assert.equal(livePressScore({ evaluation: { verdict } }), expected);
  }
});
