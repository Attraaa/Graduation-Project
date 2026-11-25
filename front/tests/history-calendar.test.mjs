import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDays, canMoveForward, datesBetween, entriesByDate, leadingBlanks, loadRange, monthDates, movePeriod,
  neighborDates, periodTitle, weekDates } from '../src/features/history/calendar.ts';
import { CURRENT_POLICIES } from '../src/features/history/currentPolicies.ts';
import { upperMinutes, upperTotals } from '../src/features/history/detail.ts';

const TODAY = '2026-10-07';  // 수요일
const KST = -540;
const at = iso => Date.parse(iso);
const posture = (over = {}) => ({ id: 's1:turtle', owner: '7', mode: 'turtle',
  startedAt: at('2026-10-02T01:05:00Z'), updatedAt: at('2026-10-02T01:23:00Z'), offsetMinutes: KST,
  scorePolicyVersion: CURRENT_POLICIES.turtle, habitPolicyVersion: CURRENT_POLICIES.habit,
  longestContinuousMs: 0, status: 'finished',
  runMs: 18 * 60_000, validMs: 18 * 60_000, scoreTimeSum: 18 * 60_000 * 70, deviationMs: 0, deviationEpisodeCount: 1, ...over });
const balance = (over = {}) => posture({ id: 's1:balance', mode: 'balance', scorePolicyVersion: CURRENT_POLICIES.balance,
  scoreTimeSum: 18 * 60_000 * 86, ...over });
const eye = (over = {}) => ({ id: 'e1', owner: '7', mode: 'eye',
  startedAt: at('2026-10-02T04:00:00Z'), updatedAt: at('2026-10-02T04:10:00Z'), offsetMinutes: KST,
  policyVersion: CURRENT_POLICIES.eye, status: 'finished',
  runMs: 10 * 60_000, validMs: 10 * 60_000, blinks: 140, breaks: 0, nearReminders: 0, openReminders: 0, ...over });
const keyboard = (over = {}) => ({
  record: { id: 'k1', owner: '7', startedAt: at('2026-10-02T02:00:00Z'), updatedAt: at('2026-10-02T02:20:00Z'),
    offsetMinutes: KST, status: 'finished', policyVersion: CURRENT_POLICIES.keyboard,
    recognitionVersion: CURRENT_POLICIES.recognition, nearbyCredit: 70, total: 10, ...over },
  counts: [
    { date: '2026-10-02', code: 'KeyA', context: 'plain', finger: 'left:pinky', verdict: 'preferred', reason: 'preferred-finger', count: 8 },
    { date: '2026-10-02', code: 'KeyA', context: 'plain', finger: null, verdict: 'unknown', reason: 'ambiguous-candidates', count: 2 },
  ] });

test('weeks start on Sunday, months list every day with leading blanks', () => {
  assert.deepEqual(weekDates('2026-10-02'),
    ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
  assert.equal(monthDates('2026-02-11').length, 28);
  assert.equal(monthDates('2026-10-07')[30], '2026-10-31');
  assert.equal(leadingBlanks('month', monthDates('2026-10-07')), 4);  // 2026-10-01은 목요일
  assert.equal(leadingBlanks('week', weekDates('2026-10-07')), 0);
  assert.equal(periodTitle('week', weekDates('2026-10-02')), '9월 27일 ~ 10월 3일');
  assert.equal(periodTitle('month', monthDates('2026-10-07')), '2026년 10월');
});

test('the loaded range adds a week on each side but never passes today, and moving never passes today', () => {
  assert.deepEqual(loadRange('week', '2026-09-30', TODAY), { from: '2026-09-20', to: '2026-10-07' });
  assert.deepEqual(loadRange('week', '2026-09-16', TODAY), { from: '2026-09-06', to: '2026-09-26' });
  assert.deepEqual(loadRange('month', '2026-09-10', TODAY), { from: '2026-08-25', to: '2026-10-07' });
  assert.equal(movePeriod('week', '2026-10-03', 1, TODAY), TODAY);
  assert.equal(movePeriod('week', '2026-10-03', -1, TODAY), '2026-09-26');
  assert.equal(movePeriod('month', '2026-10-07', -1, TODAY), '2026-09-01');
  assert.equal(movePeriod('month', '2026-09-30', 1, TODAY), '2026-10-01');
  assert.equal(canMoveForward('week', TODAY, TODAY), false);
  assert.equal(canMoveForward('week', '2026-10-03', TODAY), true);
  assert.equal(canMoveForward('month', TODAY, TODAY), false);
  assert.deepEqual(datesBetween('2026-09-29', '2026-10-02'), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
});

test('rows: one line per upper session with keyboard and eye, newest first, every policy kept', () => {
  const old = posture({ id: 'old:turtle', scorePolicyVersion: 'reference-similarity-turtle-v1',
    startedAt: at('2026-10-02T00:00:00Z'), updatedAt: at('2026-10-02T00:05:00Z'),
    runMs: 5 * 60_000, validMs: 5 * 60_000, scoreTimeSum: 5 * 60_000 * 60 });
  // One minute after the eye record's last save, so it still counts as recording.
  const byDate = entriesByDate([eye({ status: 'running' }), balance(), posture(), old],
    [keyboard({ status: 'interrupted' })], datesBetween('2026-10-01', '2026-10-03'), at('2026-10-02T04:11:00Z'));
  const rows = byDate.get('2026-10-02');
  assert.deepEqual(rows.map(row => [row.mode, row.id]), [['eye', 'e1'], ['keyboard', 'k1'], ['upper', 's1'], ['upper', 'old']]);
  const [blink, typing, upper, legacy] = rows;
  assert.equal(legacy.legacy, true);
  assert.equal(legacy.balance, null);
  assert.equal(upper.legacy, false);
  assert.equal(upper.turtle, 70);
  assert.equal(upper.balance, 86);
  assert.equal(upper.running, false);
  assert.equal(typing.interrupted, true);
  assert.equal(typing.coverage, 80);
  assert.equal(blink.rate, 14);
  assert.equal(blink.running, true);
  assert.deepEqual(byDate.get('2026-10-01'), []);
});

test('a record still marked running that stopped saving over three minutes ago shows as interrupted, not recording', () => {
  // The app was killed: no last save, so the server keeps "running" with the last periodic save as its end.
  const rows = now => entriesByDate([eye({ status: 'running' }), posture({ status: 'running' }), balance({ status: 'running' })],
    [keyboard({ status: 'running' })], ['2026-10-02'], now).get('2026-10-02');
  const live = rows(at('2026-10-02T04:12:00Z'));  // eye saved 2 min ago; upper (01:23) and keyboard (02:20) long ago
  assert.deepEqual(live.map(row => [row.mode, row.running, row.interrupted]), [['eye', true, false], ['keyboard', false, true], ['upper', false, true]]);
  const later = rows(at('2026-10-02T04:13:01Z'));
  assert.deepEqual(later.map(row => [row.running, row.interrupted]), [[false, true], [false, true], [false, true]]);
});

test('a keyboard entry in mixed history is not read as an upper record or shown twice', () => {
  const stored = keyboard();
  const mixed = { ...stored.record, mode: 'keyboard', summary: { score: 100, coverage: 80, valid: 8 } };
  const rows = entriesByDate([mixed, posture()], [stored], ['2026-10-02']).get('2026-10-02');
  assert.deepEqual(rows.map(row => [row.mode, row.id]), [['keyboard', 'k1'], ['upper', 's1']]);
});

test('legacy marks any score policy that differs from what the app writes today', () => {
  const byDate = entriesByDate(
    [posture({ scorePolicyVersion: 'upper-body-neck-v3-abc' }), balance(), eye({ policyVersion: 'eye-habits-v1' })],
    [keyboard({ recognitionVersion: 'hands-label-distance-v1' }), keyboard({ id: 'k2', policyVersion: 'ansi-qwerty-touch:1.0.0' }), keyboard({ id: 'k3' })],
    ['2026-10-02']);
  assert.deepEqual(byDate.get('2026-10-02').map(row => [row.id, row.legacy]),
    [['e1', true], ['k1', true], ['k2', true], ['k3', false], ['s1', true]]);
});

test('another 좌우 균형 민감도 or another 기준에서 벗어남 rule is still a current standard', () => {
  const sensitive = entriesByDate([posture(), balance({ scorePolicyVersion: `${CURRENT_POLICIES.balance}:s70` })], [], ['2026-10-02']).get('2026-10-02');
  assert.deepEqual(sensitive.map(row => [row.id, row.legacy]), [['s1', false]]);
  // The deviation rule follows the alert setting and each row keeps its own: another setting, the old 70점 2초 rule and
  // the removed posture-collapse slider variants (`…:s70`) are not earlier score standards.
  for (const habitPolicyVersion of ['alert-hold-v1:60:10', 'weighted-reference-deviation-v3', 'weighted-reference-deviation-v3:s70']) {
    const rows = entriesByDate([posture({ habitPolicyVersion }), balance({ habitPolicyVersion })], [], ['2026-10-02']).get('2026-10-02');
    assert.deepEqual(rows.map(row => [row.id, row.legacy]), [['s1', false]], habitPolicyVersion);
  }
});

test('calendar cells match the rows of the same date, and neighbours stay inside the loaded range', () => {
  const byDate = entriesByDate(
    [posture(), balance(), eye({ id: 'e2', startedAt: at('2026-10-05T04:00:00Z'), updatedAt: at('2026-10-05T04:10:00Z') })],
    [keyboard()], datesBetween('2026-09-26', TODAY));
  const [friday] = calendarDays(['2026-10-02'], byDate, TODAY);
  assert.deepEqual(friday.modes, ['upper', 'keyboard']);
  assert.equal(friday.totalMs, 38 * 60_000);  // 상체 18분 + 키보드 20분
  const week = calendarDays(weekDates(TODAY), byDate, TODAY);
  assert.deepEqual(week.slice(2, 5).map(day => [day.date, day.isToday, day.isFuture]),
    [['2026-10-06', false, false], ['2026-10-07', true, false], ['2026-10-08', false, true]]);
  assert.deepEqual(neighborDates(byDate, '2026-10-03', TODAY), { previous: '2026-10-02', next: '2026-10-05' });
  assert.deepEqual(neighborDates(byDate, TODAY, TODAY), { previous: '2026-10-05', next: null });
  assert.deepEqual(neighborDates(byDate, '2026-09-27', TODAY), { previous: null, next: '2026-10-02' });
});

test('upper detail joins neck and balance per minute and keeps empty minutes empty', () => {
  const minute = at('2026-10-02T01:05:00Z');
  const bucket = (over = {}) => ({ minute, runMs: 60_000, validMs: 60_000, scoreTimeSum: 60_000 * 70, deviationMs: 0, deviationEpisodeCount: 0, ...over });
  const rows = upperMinutes([
    { record: posture(), buckets: [bucket(), bucket({ minute: minute + 60_000, validMs: 0, scoreTimeSum: 0 })] },
    { record: balance(), buckets: [bucket({ scoreTimeSum: 60_000 * 86 })] },
  ]);
  assert.deepEqual(rows.map(row => [row.time, row.turtle, row.balance]), [['10:05', 70, 86], ['10:06', null, null]]);
  assert.deepEqual(upperTotals([posture(), balance({ validMs: 9 * 60_000 })]), { deviations: 2, validRate: 75 });
});
