import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboard, dashboardDates, dayEntries, pastDateOrNull, periodDates, sessionIdOf, shiftDate } from '../src/features/dashboard/summary.ts';
import { keyboardSummary } from '../../database/keyboard.ts';

const TODAY = '2026-10-06';
const KST = -540;
const at = iso => Date.parse(iso);
const build = (input = {}) => buildDashboard({ today: TODAY, posture: [], eye: [], keyboard: [], history: [], ...input });

const postureRow = (over = {}) => ({ date: TODAY, hour: '9', mode: 'turtle',
  scorePolicyVersion: 'upper-body-neck-v3-a', habitPolicyVersion: 'reference-deviation-v1',
  longestContinuousMs: 0, sessionCount: 1, recordIds: ['s1:turtle'],
  runMs: 60_000, validMs: 60_000, scoreTimeSum: 60_000 * 80, deviationMs: 0, deviationEpisodeCount: 0, ...over });
const shoulderRow = (over = {}) => postureRow({ mode: 'shoulder', scorePolicyVersion: 'upper-body-shoulder-v3-b', recordIds: ['s1:shoulder'], ...over });
const eyeRow = (over = {}) => ({ date: TODAY, hour: '13', policyVersion: 'eye-habits-v2', sessionCount: 1,
  runMs: 600_000, validMs: 600_000, blinks: 140, breaks: 2, nearReminders: 0, openReminders: 0, ...over });
const keyboardStored = (over = {}) => ({
  record: { id: 'k1', owner: '7', startedAt: at('2026-10-06T01:40:00Z'), updatedAt: at('2026-10-06T01:58:00Z'),
    offsetMinutes: KST, status: 'finished', policyVersion: 'ansi-qwerty-touch:2.0.0',
    recognitionVersion: 'hands-label-distance-v2', nearbyCredit: 70, total: 10, ...over },
  counts: [
    { date: TODAY, code: 'KeyA', context: 'plain', finger: 'left:pinky', verdict: 'preferred', reason: 'preferred-finger', count: 8 },
    { date: TODAY, code: 'KeyA', context: 'plain', finger: 'left:ring', verdict: 'nearby', reason: 'neighboring-finger', count: 2 },
  ] });

test('a keyboard entry in mixed history does not duplicate the keyboard statistics timeline', () => {
  const stored = keyboardStored();
  const history = { ...stored.record, mode: 'keyboard', summary: keyboardSummary(stored.counts, stored.record.nearbyCredit) };
  const summary = build({ history: [history], keyboard: [stored] });
  assert.equal(summary.timeline.length, 1);
  assert.equal(summary.timeline[0].mode, 'keyboard');
  assert.equal(summary.timeline[0].score, 94);
  assert.equal(summary.today.keyboard.sessions, 1);
});

test('dashboardDates covers six days back to today across month and year boundaries', () => {
  assert.deepEqual(dashboardDates('2026-10-06'),
    ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']);
  assert.deepEqual(dashboardDates('2026-01-03').slice(0, 2), ['2025-12-28', '2025-12-29']);
  assert.equal(sessionIdOf('abc:shoulder'), 'abc');
  assert.equal(sessionIdOf('abc:turtle'), 'abc');
});

test('upper body scores are valid-time weighted and one session counts once', () => {
  const summary = build({ posture: [
    postureRow({ hour: '9', runMs: 60_000, validMs: 60_000, scoreTimeSum: 60_000 * 90, deviationEpisodeCount: 1 }),
    postureRow({ hour: '10', runMs: 180_000, validMs: 180_000, scoreTimeSum: 180_000 * 70 }),
    shoulderRow({ hour: '9', runMs: 240_000, validMs: 240_000, scoreTimeSum: 240_000 * 88, deviationEpisodeCount: 2 }),
  ] });
  const upper = summary.today.upper;
  assert.equal(upper.turtle, 75);       // (90 x 1분 + 70 x 3분) / 4분
  assert.equal(upper.shoulder, 88);
  assert.equal(upper.sessions, 1);      // s1:turtle + s1:shoulder = 세션 1개
  assert.equal(upper.runMs, 240_000);   // 목·어깨 중 큰 값, 합이 아님
  assert.equal(upper.deviations, 3);
  assert.equal(summary.today.totalMs, 240_000);
});

test('only the latest policy group of each mode is used', () => {
  const summary = build({
    posture: [
      postureRow({ date: '2026-10-02', scorePolicyVersion: 'reference-similarity-turtle-v1', scoreTimeSum: 60_000 * 40 }),
      postureRow({ date: '2026-10-05', scoreTimeSum: 60_000 * 80 }),
    ],
    eye: [eyeRow({ date: '2026-10-05', policyVersion: 'eye-habits-v1' }), eyeRow()],
    keyboard: [
      keyboardStored({ id: 'old', policyVersion: 'ansi-qwerty-touch:1.0.0',
        startedAt: at('2026-10-04T00:50:00Z'), updatedAt: at('2026-10-04T01:00:00Z') }),
      keyboardStored(),
    ],
  });
  const day = date => summary.days.find(item => item.date === date);
  assert.equal(day('2026-10-02').upper.turtle, null);
  assert.equal(day('2026-10-05').upper.turtle, 80);
  assert.equal(day('2026-10-05').eye.present, false);
  assert.equal(day('2026-10-06').eye.present, true);
  assert.equal(day('2026-10-04').keyboard.present, false);
  assert.equal(day('2026-10-06').keyboard.sessions, 1);
});

test('days without records stay empty instead of zero', () => {
  const summary = build({ posture: [postureRow({ date: '2026-10-04' })] });
  const empty = summary.days.find(day => day.date === '2026-10-03');
  assert.equal(empty.upper.turtle, null);
  assert.equal(empty.upper.sessions, 0);
  assert.equal(empty.hasRecords, false);
  assert.equal(empty.totalMs, 0);
  assert.equal(summary.days.find(day => day.date === '2026-10-04').hasRecords, true);
  assert.deepEqual(summary.recent, { upper: true, keyboard: false, eye: false });
});

test('eye rate needs 30 seconds of valid observation and is never a score', () => {
  const short = build({ eye: [eyeRow({ validMs: 29_000, blinks: 10 })] });
  assert.equal(short.today.eye.rate, null);
  assert.equal(short.today.eye.present, true);
  assert.equal(short.today.hasRecords, true);
  const enough = build({ eye: [eyeRow()] });
  assert.equal(enough.today.eye.rate, 14);
  assert.equal(enough.today.eye.breaks, 2);
  assert.equal(enough.hasScores, false);
});

test('keyboard values match the shared keyboard summary and count sessions by start date', () => {
  const stored = keyboardStored();
  const today = build({ keyboard: [stored] }).today.keyboard;
  const expected = keyboardSummary(stored.counts, 70);
  assert.equal(today.score, expected.score);
  assert.equal(today.coverage, expected.coverage);
  assert.equal(today.sessions, 1);
  assert.equal(today.runMs, 18 * 60_000);
  assert.equal(today.present, true);
});

test('chart floor rounds the lowest score down to ten and stays below 100', () => {
  assert.equal(build({ posture: [postureRow({ scoreTimeSum: 60_000 * 64 })] }).chartFloor, 60);
  assert.equal(build({ posture: [postureRow({ scoreTimeSum: 60_000 * 100 })] }).chartFloor, 90);
  assert.equal(build().chartFloor, 0);
  assert.equal(build().hasScores, false);
});

const postureRecord = (over = {}) => ({ id: 's1:turtle', owner: '7', mode: 'turtle',
  startedAt: at('2026-10-06T00:12:00Z'), updatedAt: at('2026-10-06T00:37:00Z'), offsetMinutes: KST,
  scorePolicyVersion: 'upper-body-neck-v3-a', habitPolicyVersion: 'reference-deviation-v1',
  longestContinuousMs: 0, status: 'finished',
  runMs: 25 * 60_000, validMs: 25 * 60_000, scoreTimeSum: 25 * 60_000 * 84, deviationMs: 0, deviationEpisodeCount: 0, ...over });
const eyeRecord = (over = {}) => ({ id: 'e1', owner: '7', mode: 'eye',
  startedAt: at('2026-10-06T04:05:00Z'), updatedAt: at('2026-10-06T04:45:00Z'), offsetMinutes: KST,
  policyVersion: 'eye-habits-v2', status: 'finished',
  runMs: 40 * 60_000, validMs: 40 * 60_000, blinks: 560, breaks: 2, nearReminders: 0, openReminders: 0, ...over });

test('today timeline merges one upper session, keyboard and eye in start order', () => {
  const turtle = postureRecord();
  const shoulder = postureRecord({ id: 's1:shoulder', mode: 'shoulder',
    scorePolicyVersion: 'upper-body-shoulder-v3-b', scoreTimeSum: 25 * 60_000 * 89 });
  const yesterday = postureRecord({ id: 's0:turtle', startedAt: at('2026-10-05T00:12:00Z') });
  const summary = build({ history: [eyeRecord({ status: 'interrupted' }), shoulder, turtle, yesterday], keyboard: [keyboardStored()] });
  assert.deepEqual(summary.timeline.map(entry => [entry.mode, entry.id]), [['upper', 's1'], ['keyboard', 'k1'], ['eye', 'e1']]);
  const [upper, keyboard, eye] = summary.timeline;
  assert.equal(upper.turtle, 84);
  assert.equal(upper.shoulder, 89);
  assert.equal(upper.endedAt - upper.startedAt, 25 * 60_000);
  assert.equal(upper.interrupted, false);
  assert.equal(keyboard.score, keyboardSummary(keyboardStored().counts, 70).score);
  assert.equal(keyboard.endedAt - keyboard.startedAt, 18 * 60_000);
  assert.equal(eye.rate, 14);
  assert.equal(eye.interrupted, true);
});

test('timeline drops records from a policy that is not the latest', () => {
  const summary = build({ posture: [postureRow()],
    history: [postureRecord({ id: 'old:turtle', scorePolicyVersion: 'reference-similarity-turtle-v1' }), postureRecord()] });
  assert.deepEqual(summary.timeline.map(entry => entry.id), ['s1']);
});

test('deviation hours sum neck and shoulder episodes over the shown hour range', () => {
  const summary = build({ posture: [
    postureRow({ hour: '9', deviationEpisodeCount: 1 }),
    shoulderRow({ hour: '9', deviationEpisodeCount: 2 }),
    postureRow({ date: '2026-10-05', hour: '12', deviationEpisodeCount: 4 }),
  ] });
  assert.deepEqual(summary.deviationHours.map(hour => [hour.hour, hour.count, hour.strong]),
    [[9, 3, true], [10, 0, false], [11, 0, false], [12, 4, true]]);
  assert.deepEqual(build().deviationHours, []);
});

test('date helpers shift across months, build periods of any length and accept only real past dates', () => {
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDate('2025-12-31', 1), '2026-01-01');
  assert.deepEqual(periodDates('2026-10-06', 3), ['2026-10-04', '2026-10-05', '2026-10-06']);
  assert.equal(periodDates('2026-10-06', 30)[0], '2026-09-07');
  assert.equal(pastDateOrNull('2026-10-02', TODAY), '2026-10-02');
  assert.equal(pastDateOrNull('2026-10-07', TODAY), null);
  assert.equal(pastDateOrNull('2026-02-30', TODAY), null);
  assert.equal(pastDateOrNull('10/02', TODAY), null);
  assert.equal(pastDateOrNull(null, TODAY), null);
});

test('day entries without a filter keep every policy and expose the stored records', () => {
  const old = postureRecord({ id: 'old:turtle', scorePolicyVersion: 'reference-similarity-turtle-v1' });
  const entries = dayEntries([old, postureRecord()], [], TODAY);
  assert.deepEqual(entries.map(entry => entry.id), ['old', 's1']);
  assert.equal(entries[0].source.mode, 'upper');
  assert.deepEqual(entries[0].source.records, [old]);
});
