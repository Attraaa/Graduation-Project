import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionClock } from '../src/features/session/sessionClock.ts';
import { appendTrend, liveTimeAxis, liveTimeLabel } from '../src/features/session/trend.ts';
import { addPostureSegment, emptyScoreTotals, measurementDuration, measurementSummary, postureRunAverages } from '../src/features/session/measurementSummary.ts';
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
  const point = (at, neck) => ({ at, neck, balance: neck, keyboard: null });
  let points = appendTrend([], point(0, 0));
  points = appendTrend(points, point(200, null));
  points = appendTrend(points, point(400, 88));
  assert.deepEqual(points.map(item => item.neck), [0, null, 88]);
  assert.equal(appendTrend(points, point(450, 90)), points);
  assert.equal(appendTrend(points, point(399, 90)), points);
  points = appendTrend(points, point(400_000, 90));
  assert.equal(points.length, 1);
});

test('live axis uses whole minute marks anchored to the final frame, even with jitter and short sessions', () => {
  const point = at => ({ at, neck: null, balance: null, keyboard: 80 });
  const { end, ticks, domain } = liveTimeAxis([point(78.5), point(298988.25)]);
  assert.deepEqual(domain, [end - 300_000, end]);
  assert.deepEqual(ticks.map(tick => liveTimeLabel(tick, end)), ['5분 전', '4분 전', '3분 전', '2분 전', '1분 전', '최근']);
  assert.deepEqual(liveTimeAxis([point(140.2)]).ticks.map(tick => liveTimeLabel(tick, 140.2)), ['1분 전', '최근']);
  assert.equal(liveTimeLabel(end - 74_900, end), '1분 15초 전');
});

test('stop summary combines recapture segments with valid-time weighting and uses whole-session keyboard totals', () => {
  const score = (averageScore, validMs) => ({ averageScore, validMs });
  const first = addPostureSegment(emptyScoreTotals(), { neck: score(0, 3000), balance: score(null, 0) });
  const averages = postureRunAverages(first, { neck: score(80, 1000), balance: score(null, 0) });
  assert.deepEqual(averages, { neck: 20, balance: null });
  const counts = ['preferred', 'mismatch'].map(verdict => ({ count: 1, verdict }));
  const all = { upper: { snapshot: { runAverages: averages }, eye: { measurement: { blinksPerMinute: 0, recentBlinksPerMinute: 12 } } },
    keyboard: { snapshot: { counts, scores: [100] } } };
  assert.deepEqual(measurementSummary(all, 'upper_body', 67.1).metrics.map(metric => metric.value), [20, null, 0]);
  assert.deepEqual(measurementSummary(all, 'keyboard', 61.9).metrics.map(metric => metric.value), [50, 2, 100]);
  assert.equal(measurementDuration(3662.3), '1시간 1분 2초');
});
test('single-input keyboard values use the existing 100/70/0 aggregation and never score unknown input', () => {
  assert.equal(livePressScore(null), null);
  for (const verdict of ['preferred', 'acceptable', 'nearby', 'mismatch', 'unknown']) {
    const expected = keyboardTotalsSummary({ preferred: 0, acceptable: 0, nearby: 0, mismatch: 0, unknown: 0, unsupported: 0, [verdict]: 1 }).score;
    assert.equal(livePressScore({ evaluation: { verdict } }), expected);
  }
});
