import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatistics, fullDayHours, statisticsRange } from '../src/features/statistics/period.ts';
import { changeChip, percentLabel, previousRateChip, rangeText } from '../src/features/statistics/text.ts';
import { dailyKeyboardPractice } from '../src/features/keyboard/dailyPractice.ts';

const END = '2026-10-06';
const postureRow = (over = {}) => ({ date: END, hour: '9', mode: 'turtle',
  scorePolicyVersion: 'upper-body-neck-v3-a', habitPolicyVersion: 'weighted-reference-deviation-v3',
  longestContinuousMs: 0, sessionCount: 1, recordIds: ['s1:turtle'],
  runMs: 60_000, validMs: 60_000, scoreTimeSum: 60_000 * 80, deviationMs: 0, deviationEpisodeCount: 0, ...over });
const balanceRow = (over = {}) => postureRow({ mode: 'balance', scorePolicyVersion: 'upper-body-balance-v3-b', recordIds: ['s1:balance'], ...over });
const eyeRow = (over = {}) => ({ date: END, hour: '13', policyVersion: 'eye-habits-v2', sessionCount: 1,
  runMs: 600_000, validMs: 600_000, blinks: 140, breaks: 2, nearReminders: 1, openReminders: 3, ...over });
const build = (input = {}) => buildStatistics({ end: END, days: 7, posture: [], eye: [], keyboard: [], ...input });

test('the current period ends at the end date and the previous period sits right before it', () => {
  assert.deepEqual(statisticsRange(END, 7), { from: '2026-09-23', to: END,
    dates: ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'],
    previousDates: ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29'] });
  const month = statisticsRange('2026-01-10', 30);
  assert.equal(month.dates.length, 30);
  assert.equal(month.dates[0], '2025-12-12');
  assert.equal(month.previousDates[29], '2025-12-11');
  assert.equal(month.from, '2025-11-12');
});

test('the 1-day period compares with yesterday and keeps hourly gaps and genuine zero values', () => {
  const yesterday = '2026-10-05';
  assert.deepEqual(statisticsRange(END, 1), { from: yesterday, to: END, dates: [END], previousDates: [yesterday] });
  const result = build({ days: 1, posture: [postureRow({ hour: '9', scoreTimeSum: 0 }), postureRow({ date: yesterday }), postureRow({ hour: '14' })] });
  const hours = fullDayHours(result.upper.hourly);
  assert.equal(hours.length, 24);
  assert.equal(hours[9].turtle, 0);
  assert.equal(hours[11].turtle, null);
  assert.equal(hours[14].turtle, 80);
  assert.equal(changeChip(result.upper.turtle, 1).text, '전날보다 -40');
});

test('daily keyboard practice uses each session’s counts only on the chosen day including midnight crossings', () => {
  const at = Date.parse(`${END}T05:00:00Z`), offsetMinutes = -540;
  const counts = [{ date: END, verdict: 'preferred', count: 8 }, { date: '2026-10-05', verdict: 'mismatch', count: 12 }];
  const rows = dailyKeyboardPractice([{ record: { startedAt: at, offsetMinutes, nearbyCredit: 70 }, counts },
    { record: { startedAt: at - 86_400_000, offsetMinutes, nearbyCredit: 70 }, counts: [{ date: END, verdict: 'mismatch', count: 1 }] }], END);
  assert.deepEqual(rows.map(({ at, score }) => [new Date(at).toISOString(), score]), [['2026-10-05T15:00:00.000Z', 0], ['2026-10-06T05:00:00.000Z', 100]]);
});

test('upper averages are valid-time weighted and compared as the integers shown', () => {
  const summary = build({ posture: [
    postureRow({ date: '2026-10-05', scoreTimeSum: 60_000 * 90 }),
    postureRow({ date: '2026-10-06', recordIds: ['s2:turtle'], runMs: 180_000, validMs: 180_000, scoreTimeSum: 180_000 * 70 }),
    postureRow({ date: '2026-09-29', recordIds: ['s0:turtle'], scoreTimeSum: 60_000 * 71.5 }),
  ] });
  assert.equal(summary.upper.turtle.current, 75);     // (90 x 1분 + 70 x 3분) / 4분
  assert.equal(summary.upper.turtle.previous, 71.5);
  assert.equal(summary.upper.turtle.change, 3);       // 75 - 72, 보이는 정수끼리
  assert.equal(summary.upper.balance.current, null);
  assert.equal(summary.upper.balance.change, null);
});

test('policy groups never mix, in the current or the previous period', () => {
  const summary = build({ posture: [
    postureRow({ date: '2026-09-29', scorePolicyVersion: 'upper-body-neck-v3-old', scoreTimeSum: 60_000 * 40 }),
    postureRow({ date: '2026-10-02', scorePolicyVersion: 'upper-body-neck-v3-old', scoreTimeSum: 60_000 * 40 }),
    postureRow({ date: '2026-10-06', scoreTimeSum: 60_000 * 80 }),
  ] });
  assert.equal(summary.upper.turtle.current, 80);
  assert.equal(summary.upper.turtle.previous, null);
  assert.equal(summary.days.find(day => day.date === '2026-10-02').upper.turtle, null);
});

test('sessions count once across neck, balance and midnight; time is the daily max of neck and balance', () => {
  const upper = build({ posture: [
    postureRow({ date: '2026-10-05', hour: '23', runMs: 120_000, validMs: 90_000, scoreTimeSum: 90_000 * 80,
      longestContinuousMs: 50_000, deviationEpisodeCount: 1, deviationMs: 9_000 }),
    postureRow({ date: '2026-10-06', hour: '0', runMs: 60_000, validMs: 60_000, scoreTimeSum: 60_000 * 80, longestContinuousMs: 50_000 }),
    balanceRow({ date: '2026-10-05', hour: '23', runMs: 120_000, validMs: 120_000, scoreTimeSum: 120_000 * 90,
      longestContinuousMs: 70_000, deviationEpisodeCount: 2, deviationMs: 3_000 }),
    balanceRow({ date: '2026-10-06', hour: '0', runMs: 60_000, validMs: 30_000, scoreTimeSum: 30_000 * 90 }),
  ] }).upper;
  assert.equal(upper.sessions, 1);
  assert.equal(upper.runMs, 180_000);                  // 10/5 max(120k, 120k) + 10/6 max(60k, 60k)
  assert.equal(upper.averageMs, 180_000);
  assert.equal(upper.longestMs, 70_000);
  assert.equal(upper.deviations, 3);
  assert.equal(upper.deviationRate, 100 * 12_000 / 300_000);
  assert.equal(upper.validRate, 100 * 300_000 / 360_000);
  assert.equal(Math.round(upper.unmeasuredMs), 30_000);  // 180k x (1 - 300/360)
});

test('hourly scores leave hours without rows empty and span the first to the last hour', () => {
  const summary = build({ posture: [postureRow({ hour: '9' }), postureRow({ hour: '11', scoreTimeSum: 60_000 * 60 })] });
  assert.deepEqual(summary.upper.hourly.map(hour => [hour.hour, hour.turtle, hour.balance]),
    [[9, 80, null], [10, null, null], [11, 60, null]]);
  assert.equal(summary.upper.hourlyFloor, 60);
});

test('deviation hours follow the chosen period and leave out the previous one', () => {
  const posture = [
    postureRow({ hour: '9', deviationEpisodeCount: 1 }),
    balanceRow({ hour: '9', deviationEpisodeCount: 2 }),
    postureRow({ date: '2026-09-29', hour: '15', recordIds: ['s0:turtle'], deviationEpisodeCount: 5 }),  // 7일 기준 이전 기간
    postureRow({ date: '2026-09-20', hour: '20', recordIds: ['s9:turtle'], deviationEpisodeCount: 9 }),
  ];
  assert.deepEqual(build({ posture }).upper.deviationHours, [{ hour: 9, count: 3, strong: true, observedMs: 60_000 }]);
  const month = build({ posture, days: 30 }).upper.deviationHours;
  assert.deepEqual([month[0].hour, month.at(-1).hour], [9, 20]);
  assert.deepEqual(month.filter(hour => hour.strong).map(hour => [hour.hour, hour.count]), [[20, 9]]);
  assert.deepEqual(build().upper.deviationHours, []);
});

test('a zero score day is 0, a day without records is null, and empty input stays empty', () => {
  const summary = build({ posture: [postureRow({ date: '2026-10-04', scoreTimeSum: 0 })] });
  assert.equal(summary.days.find(day => day.date === '2026-10-04').upper.turtle, 0);
  assert.equal(summary.days.find(day => day.date === '2026-10-03').upper.turtle, null);
  const empty = build();
  assert.equal(empty.upper.present, false);
  assert.equal(empty.upper.sessions, 0);
  assert.equal(empty.upper.averageMs, null);
  assert.equal(empty.upper.validRate, null);
  assert.equal(empty.upperFloor, 0);
  assert.deepEqual(empty.upper.hourly, []);
  assert.equal(empty.eye.present, false);
  assert.equal(empty.eyeMax, 20);
});

test('eye rate needs 30 seconds, keeps the previous period as a value and sums the totals', () => {
  const summary = build({ eye: [eyeRow({ hour: '13' }), eyeRow({ hour: '15', blinks: 100 }), eyeRow({ date: '2026-09-29', blinks: 130 })] });
  const eye = summary.eye;
  assert.equal(eye.rate, 12);                          // 240회 / 20분
  assert.equal(eye.previousRate, 13);
  assert.equal(eye.runMs, 1_200_000);
  assert.equal(eye.validMs, 1_200_000);
  assert.equal(eye.breaks, 4);
  assert.equal(eye.nearReminders, 2);
  assert.equal(eye.openReminders, 6);
  assert.equal(eye.validRate, 100);
  assert.deepEqual(eye.hourly.map(hour => [hour.hour, hour.rate]), [[13, 14], [14, null], [15, 10]]);
  assert.equal(eye.hourlyMax, 20);
  assert.equal(summary.eyeMax, 20);
  const short = build({ eye: [eyeRow({ validMs: 29_000, blinks: 10 })] }).eye;
  assert.equal(short.rate, null);
  assert.equal(short.present, true);
});

test('chips compare shown integers, the eye chip shows the previous value only', () => {
  assert.deepEqual(changeChip({ current: 84, previous: 81, change: 3 }, 7), { text: '직전 7일보다 +3', tone: 'good' });
  assert.deepEqual(changeChip({ current: 80, previous: 82, change: -2 }, 30), { text: '직전 30일보다 -2', tone: 'neutral' });
  assert.deepEqual(changeChip({ current: 80, previous: 80, change: 0 }, 7), { text: '직전 7일보다 0', tone: 'neutral' });
  assert.equal(changeChip({ current: 80, previous: null, change: null }, 7), null);
  assert.deepEqual(previousRateChip(13.4, 7), { text: '직전 7일 13회/분', tone: 'neutral' });
  assert.equal(previousRateChip(null, 7), null);
  assert.equal(percentLabel(null), '—');
  assert.equal(percentLabel(91.6), '92%');
  assert.equal(rangeText('2026-09-30', '2026-10-06'), '9월 30일 ~ 10월 6일');
});
