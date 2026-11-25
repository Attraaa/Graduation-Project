import test from 'node:test';
import assert from 'node:assert/strict';
import { dayEntries, dayValues, deviationHours, latestPolicyGroups, pastDateOrNull, periodDates, scoreFloor, sessionIdOf, shiftDate } from '../src/features/dashboard/summary.ts';
import { keyboardSummary } from '../../database/keyboard.ts';

const TODAY = '2026-10-06';
const KST = -540;
const at = iso => Date.parse(iso);
const groups = (input = {}) => latestPolicyGroups({ posture: [], eye: [], keyboard: [], ...input });
const day = (input = {}, date = TODAY) => dayValues(groups(input), date);

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

test('a keyboard entry in mixed history does not duplicate the keyboard record', () => {
  const stored = keyboardStored();
  const history = { ...stored.record, mode: 'keyboard', summary: keyboardSummary(stored.counts, stored.record.nearbyCredit) };
  const entries = dayEntries([history], [stored], TODAY);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].mode, 'keyboard');
  assert.equal(entries[0].score, 94);
  assert.equal(day({ keyboard: [stored] }).keyboard.sessions, 1);
});

test('a seven-day period covers six days back to today across month and year boundaries', () => {
  assert.deepEqual(periodDates('2026-10-06', 7),
    ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']);
  assert.deepEqual(periodDates('2026-01-03', 7).slice(0, 2), ['2025-12-28', '2025-12-29']);
  assert.equal(sessionIdOf('abc:shoulder'), 'abc');
  assert.equal(sessionIdOf('abc:turtle'), 'abc');
});

test('upper body scores are valid-time weighted and one session counts once', () => {
  const today = day({ posture: [
    postureRow({ hour: '9', runMs: 60_000, validMs: 60_000, scoreTimeSum: 60_000 * 90, deviationEpisodeCount: 1 }),
    postureRow({ hour: '10', runMs: 180_000, validMs: 180_000, scoreTimeSum: 180_000 * 70 }),
    shoulderRow({ hour: '9', runMs: 240_000, validMs: 240_000, scoreTimeSum: 240_000 * 88, deviationEpisodeCount: 2 }),
  ] });
  const upper = today.upper;
  assert.equal(upper.turtle, 75);       // (90 x 1분 + 70 x 3분) / 4분
  assert.equal(upper.shoulder, 88);
  assert.equal(upper.sessions, 1);      // s1:turtle + s1:shoulder = 세션 1개
  assert.equal(upper.runMs, 240_000);   // 목·어깨 중 큰 값, 합이 아님
  assert.equal(upper.deviations, 3);
  assert.equal(today.totalMs, 240_000);
});

test('only the latest policy group of each mode is used', () => {
  const selected = groups({
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
  const on = date => dayValues(selected, date);
  assert.equal(on('2026-10-02').upper.turtle, null);
  assert.equal(on('2026-10-05').upper.turtle, 80);
  assert.equal(on('2026-10-05').eye.present, false);
  assert.equal(on('2026-10-06').eye.present, true);
  assert.equal(on('2026-10-04').keyboard.present, false);
  assert.equal(on('2026-10-06').keyboard.sessions, 1);
});

test('days without records stay empty instead of zero', () => {
  const posture = [postureRow({ date: '2026-10-04' })];
  const empty = day({ posture }, '2026-10-03');
  assert.equal(empty.upper.turtle, null);
  assert.equal(empty.upper.sessions, 0);
  assert.equal(empty.hasRecords, false);
  assert.equal(empty.totalMs, 0);
  assert.equal(day({ posture }, '2026-10-04').hasRecords, true);
});

test('eye rate needs 30 seconds of valid observation', () => {
  const short = day({ eye: [eyeRow({ validMs: 29_000, blinks: 10 })] });
  assert.equal(short.eye.rate, null);
  assert.equal(short.eye.present, true);
  assert.equal(short.hasRecords, true);
  const enough = day({ eye: [eyeRow()] });
  assert.equal(enough.eye.rate, 14);
  assert.equal(enough.eye.breaks, 2);
});

test('keyboard values match the shared keyboard summary and count sessions by start date', () => {
  const stored = keyboardStored();
  const today = day({ keyboard: [stored] }).keyboard;
  const expected = keyboardSummary(stored.counts, 70);
  assert.equal(today.score, expected.score);
  assert.equal(today.coverage, expected.coverage);
  assert.equal(today.sessions, 1);
  assert.equal(today.runMs, 18 * 60_000);
  assert.equal(today.present, true);
});

test('chart floor rounds the lowest score down to ten and stays below 100', () => {
  assert.equal(scoreFloor([88, 64, 75]), 60);
  assert.equal(scoreFloor([100]), 90);
  assert.equal(scoreFloor([]), 0);
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

test('day entries merge one upper session, keyboard and eye, newest first', () => {
  const turtle = postureRecord();
  const shoulder = postureRecord({ id: 's1:shoulder', mode: 'shoulder',
    scorePolicyVersion: 'upper-body-shoulder-v3-b', scoreTimeSum: 25 * 60_000 * 89 });
  const yesterday = postureRecord({ id: 's0:turtle', startedAt: at('2026-10-05T00:12:00Z') });
  const entries = dayEntries([eyeRecord({ status: 'interrupted' }), shoulder, turtle, yesterday], [keyboardStored()], TODAY);
  assert.deepEqual(entries.map(entry => [entry.mode, entry.id]), [['eye', 'e1'], ['keyboard', 'k1'], ['upper', 's1']]);
  const [eye, keyboard, upper] = entries;
  assert.equal(upper.turtle, 84);
  assert.equal(upper.shoulder, 89);
  assert.equal(upper.endedAt - upper.startedAt, 25 * 60_000);
  assert.equal(upper.interrupted, false);
  assert.equal(keyboard.score, keyboardSummary(keyboardStored().counts, 70).score);
  assert.equal(keyboard.endedAt - keyboard.startedAt, 18 * 60_000);
  assert.equal(eye.rate, 14);
  assert.equal(eye.interrupted, true);
});

test('deviation hours sum neck and shoulder episodes over the shown hour range', () => {
  const hours = deviationHours([
    postureRow({ hour: '9', deviationEpisodeCount: 1 }),
    shoulderRow({ hour: '9', deviationEpisodeCount: 2 }),
    postureRow({ date: '2026-10-05', hour: '12', deviationEpisodeCount: 4 }),
  ]);
  assert.deepEqual(hours.map(hour => [hour.hour, hour.count, hour.strong]),
    [[9, 3, true], [10, 0, false], [11, 0, false], [12, 4, true]]);
  assert.deepEqual(deviationHours([]), []);
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

test('day entries keep every policy and expose the stored records', () => {
  const old = postureRecord({ id: 'old:turtle', scorePolicyVersion: 'reference-similarity-turtle-v1' });
  const entries = dayEntries([old, postureRecord()], [], TODAY);
  assert.deepEqual(entries.map(entry => entry.id), ['old', 's1']);
  assert.equal(entries[0].source.mode, 'upper');
  assert.deepEqual(entries[0].source.records, [old]);
});
