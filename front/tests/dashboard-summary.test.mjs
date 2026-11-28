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
const balanceRow = (over = {}) => postureRow({ mode: 'balance', scorePolicyVersion: 'upper-body-balance-v3-b', recordIds: ['s1:balance'], ...over });
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
  assert.equal(sessionIdOf('abc:balance'), 'abc');
  assert.equal(sessionIdOf('abc:turtle'), 'abc');
});

test('upper body scores are valid-time weighted and one session counts once', () => {
  const today = day({ posture: [
    postureRow({ hour: '9', runMs: 60_000, validMs: 60_000, scoreTimeSum: 60_000 * 90, deviationEpisodeCount: 1 }),
    postureRow({ hour: '10', runMs: 180_000, validMs: 180_000, scoreTimeSum: 180_000 * 70 }),
    balanceRow({ hour: '9', runMs: 240_000, validMs: 240_000, scoreTimeSum: 240_000 * 88, deviationEpisodeCount: 2 }),
  ] });
  const upper = today.upper;
  assert.equal(upper.turtle, 75);       // (90 x 1분 + 70 x 3분) / 4분
  assert.equal(upper.balance, 88);
  assert.equal(upper.sessions, 1);      // s1:turtle + s1:balance = 세션 1개
  assert.equal(upper.runMs, 240_000);   // 목·좌우 균형 중 큰 값, 합이 아님
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

test('a changed alert setting (기준에서 벗어남 rule) keeps earlier upper rows; another 좌우 균형 민감도 starts a new group', () => {
  const selected = groups({ posture: [
    postureRow({ date: '2026-10-04', habitPolicyVersion: 'alert-hold-v1:70:3', deviationEpisodeCount: 2, scoreTimeSum: 60_000 * 70 }),
    postureRow({ date: '2026-10-05', habitPolicyVersion: 'alert-hold-v1:60:10', deviationEpisodeCount: 1, scoreTimeSum: 60_000 * 90 }),
    balanceRow({ date: '2026-10-04', scoreTimeSum: 60_000 * 50 }),
    balanceRow({ date: '2026-10-05', scorePolicyVersion: 'upper-body-balance-v3-b:s80', scoreTimeSum: 60_000 * 30 }),
  ] });
  const on = date => dayValues(selected, date).upper;
  // Each row keeps the count made with its own rule; both days stay in the statistics.
  assert.deepEqual([on('2026-10-04').turtle, on('2026-10-05').turtle], [70, 90]);
  assert.deepEqual([on('2026-10-04').deviations, on('2026-10-05').deviations], [2, 1]);
  // The score itself changed with the sensitivity, so only the latest sensitivity's balance rows count.
  assert.deepEqual([on('2026-10-04').balance, on('2026-10-05').balance], [null, 30]);
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

test('day entries merge one upper session and keyboard; an eye record without a camera run is a 상체 row of its own', () => {
  const turtle = postureRecord();
  const balance = postureRecord({ id: 's1:balance', mode: 'balance',
    scorePolicyVersion: 'upper-body-balance-v3-b', scoreTimeSum: 25 * 60_000 * 89 });
  const yesterday = postureRecord({ id: 's0:turtle', startedAt: at('2026-10-05T00:12:00Z') });
  const entries = dayEntries([eyeRecord({ status: 'interrupted' }), balance, turtle, yesterday], [keyboardStored()], TODAY);
  assert.deepEqual(entries.map(entry => [entry.mode, entry.id]), [['upper', 'e1'], ['keyboard', 'k1'], ['upper', 's1']]);
  const [eye, keyboard, upper] = entries;
  assert.equal(upper.turtle, 84);
  assert.equal(upper.balance, 89);
  assert.equal(upper.endedAt - upper.startedAt, 25 * 60_000);
  assert.equal(upper.interrupted, false);
  assert.equal(upper.source.eye, null);
  assert.equal(keyboard.score, keyboardSummary(keyboardStored().counts, 70).score);
  assert.equal(keyboard.endedAt - keyboard.startedAt, 18 * 60_000);
  assert.equal(eye.rate, 14);
  assert.equal(eye.interrupted, true);
  assert.equal(eye.turtle, null);
  assert.deepEqual(eye.source.records, []);
  assert.equal(eye.source.eye.id, 'e1');
});

test('one camera run is one 상체 row: every reference segment and the eye record of the same camera (2026-11-28)', () => {
  const run = '0f8c1a2e-5b7d-4c3a-9e21-6d4f8a9b0c11';
  const segment = (name, mode, over) => postureRecord({ id: `camera:${run}:${name}:${mode}`, mode,
    scorePolicyVersion: mode === 'balance' ? 'upper-body-balance-v3-b' : 'upper-body-neck-v3-a', ...over });
  const first = { startedAt: at('2026-10-06T00:12:00Z'), runMs: 10 * 60_000, validMs: 10 * 60_000 };
  const second = { startedAt: at('2026-10-06T00:22:00Z'), runMs: 15 * 60_000, validMs: 15 * 60_000 };
  const entries = dayEntries([
    segment('a', 'turtle', { ...first, scoreTimeSum: 10 * 60_000 * 90 }),
    segment('a', 'balance', { ...first, scoreTimeSum: 10 * 60_000 * 80 }),
    // A new reference ("기준 다시 잡기") starts another segment of the same camera run.
    segment('b', 'turtle', { ...second, scoreTimeSum: 15 * 60_000 * 70 }),
    segment('b', 'balance', { ...second, scoreTimeSum: 15 * 60_000 * 85 }),
    eyeRecord({ id: `camera:${run}:eye`, startedAt: at('2026-10-06T00:11:30Z'), runMs: 26 * 60_000, validMs: 20 * 60_000, blinks: 300 }),
  ], [], TODAY);
  assert.deepEqual(entries.map(entry => [entry.mode, entry.id]), [['upper', `camera:${run}`]]);
  const [row] = entries;
  assert.equal(row.turtle, 78);   // (90 x 10분 + 70 x 15분) / 25분
  assert.equal(row.balance, 83);  // (80 x 10분 + 85 x 15분) / 25분
  assert.equal(row.rate, 15);     // 300회 / 유효 관찰 20분
  assert.equal(row.startedAt, at('2026-10-06T00:11:30Z'));
  assert.equal(row.endedAt, at('2026-10-06T00:37:30Z'));
  assert.equal(row.source.records.length, 4);
  assert.equal(row.source.eye.id, `camera:${run}:eye`);
});

test('the day total counts the shared 상체 camera time once: the longer of 상체 and 안구, plus keyboard', () => {
  const today = day({ posture: [postureRow({ runMs: 240_000, validMs: 240_000, scoreTimeSum: 240_000 * 80 })],
    eye: [eyeRow({ runMs: 300_000, validMs: 300_000 })], keyboard: [keyboardStored()] });
  assert.equal(today.totalMs, 300_000 + 18 * 60_000);
});

test('deviation hours sum neck and balance episodes over the shown hour range', () => {
  const hours = deviationHours([
    postureRow({ hour: '9', deviationEpisodeCount: 1 }),
    balanceRow({ hour: '9', deviationEpisodeCount: 2 }),
    postureRow({ date: '2026-10-05', hour: '12', deviationEpisodeCount: 4 }),
  ]);
  assert.deepEqual(hours.map(hour => [hour.hour, hour.count, hour.strong]),
    [[9, 3, true], [10, 0, false], [11, 0, false], [12, 4, true]]);
  assert.deepEqual(hours.map(hour => hour.observedMs), [60_000, 0, 0, 60_000]); // neck and balance overlap, so the longer one counts
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
