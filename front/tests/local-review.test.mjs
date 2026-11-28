import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { loggedIn } from './fixtures/memory-records.mjs';
import { createPostureScoreTimeline } from '../src/features/posture/scoreTimeline.ts';
import { localPostureDaily, localPostureReview, readReviewSession } from '../src/features/records/reviewSession.ts';

test('independent sensor clocks keep time-weighted seconds, genuine zero and the final partial second', () => {
  const points = [];
  const timeline = createPostureScoreTimeline(0, batch => points.push(...batch));
  const reading = (currentScore, validMs) => ({ currentScore, validMs, scoreTimeSum: currentScore * validMs });
  timeline.sample('shoulder', 600, reading(80, 0));
  timeline.sample('shoulder', 1100, reading(80, 500));
  timeline.sample('neck', 900, reading(0, 0));
  assert.equal(points.length, 0);
  timeline.sample('neck', 1200, reading(0, 300));
  timeline.finish(1250);
  assert.deepEqual(points, [
    { second: 1, neck: 0, shoulder: 80, neckValidMs: 100, shoulderValidMs: 400 },
    { second: 2, neck: 0, shoulder: 80, neckValidMs: 200, shoulderValidMs: 100 },
  ]);
});

const raw = (startedAt, policy, mean, validMs) => ({ type: 'posture-session-summary', schemaVersion: 1,
  startedAt, endedAt: startedAt + 1000, scorePolicyVersions: { neck: policy, shoulder: policy },
  neck: { meanPoints: mean, validMs }, shoulder: { meanPoints: mean, validMs } });

test('local summary read filters the period, preserves previous policy, weights by observed time and keeps old shoulder labels', () => {
  const rows = [raw(10, 'v3', 80, 1000), raw(2050, 'v3', 100, 1000), raw(3060, 'v3', 0, 250),
    raw(4050, 'upper-body-balance-v1-test', 75, 1000)];
  const before = rows.map(x => readReviewSession(x, 0, 4000)).filter(Boolean);
  const summary = localPostureReview(before, 2000);
  assert.deepEqual(summary.neck, { current: 80, previous: 80 });
  assert.equal(summary.sideMetric, 'shoulder');
  const after = localPostureReview(rows.map(x => readReviewSession(x, 0, 5000)), 2000);
  assert.deepEqual(after.side, { current: 75, previous: null });
  assert.equal(after.sideMetric, 'balance');
  assert.equal(readReviewSession(raw(10, 'v3', 102, 100), 0, 100), null);
});

test('device sessions give the review its daily and hourly means, observed minutes and the longest session', () => {
  const at = (date, hour, minute = 0) => new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`).getTime();
  const session = (startedAt, minutes, neck, side, policy = 'upper-body-balance-v1-test') => ({ startedAt, endedAt: startedAt + minutes * 60_000,
    scorePolicyVersions: { neck: policy, shoulder: policy },
    neck: { validMs: minutes * 60_000, meanPoints: neck, mostObservedBand: null }, shoulder: { validMs: minutes * 30_000, meanPoints: side, mostObservedBand: null } });
  const sessions = [session(at('2026-11-20', 9), 30, 80, 90), session(at('2026-11-20', 9, 40), 10, 60, 70), session(at('2026-11-21', 15), 50, 76, 86)];
  const since = at('2026-11-15', 0);
  const review = localPostureReview(sessions, since);
  assert.deepEqual(review.hourly, [{ hour: 9, neck: 75, side: 85, minutes: 40 }, { hour: 15, neck: 76, side: 86, minutes: 50 }]);
  assert.equal(review.longestMinutes, 50);
  assert.deepEqual(localPostureDaily(sessions, since, ['2026-11-19', '2026-11-20', '2026-11-21']), [
    { date: '2026-11-19', neck: null, side: null }, { date: '2026-11-20', neck: 75, side: 85 }, { date: '2026-11-21', neck: 76, side: 86 }]);
});

test('finishing eye and keyboard records saves review data under the signed-in owner while AWS is offline', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.window = { dispatchEvent() {} };
  globalThis.localStorage = loggedIn('42');
  globalThis.fetch = async () => { throw new Error('offline'); };
  t.after(() => { globalThis.fetch = originalFetch; delete globalThis.window; delete globalThis.localStorage; });
  const built = await build({ stdin: { contents: `
    export { beginEyeRecording } from './src/features/eye/recording';
    export { beginKeyboardRecording } from './src/features/keyboard/recording';
    export { readLocalReviewResults, clearLocalReviewResults } from './src/features/records/localReviewResults';
  `, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
  const local = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
  const eye = local.beginEyeRecording(), keys = local.beginKeyboardRecording();
  const at = performance.now();
  eye.sample(at, { validMs: 0, blinks: 0, nearReminder: false, openReminder: false });
  eye.sample(at + 60_000, { validMs: 60_000, blinks: 12, nearReminder: false, openReminder: false });
  keys.press({ id: 1, code: 'KeyA', context: 'plain', evaluation: { observed: 'left:pinky', verdict: 'preferred', reason: 'preferred-finger' } });
  eye.finish(); keys.finish();
  const read = owner => local.readLocalReviewResults(owner, '2000-01-01', '2100-01-01');
  const result = await read('42');
  assert.equal(result.eye.reduce((n, bucket) => n + bucket.validMs, 0), 60_000);
  assert.equal(result.eye.reduce((n, bucket) => n + bucket.blinks, 0), 12);
  assert.equal(result.keyboard[0].counts[0].count, 1);
  assert.deepEqual(await read('43'), { eye: [], keyboard: [] });
  await local.clearLocalReviewResults('42');
  assert.deepEqual(await read('42'), { eye: [], keyboard: [] });
});

test('browser review reads completed summaries only, isolates owners, and clears only the selected account', async () => {
  const built = await build({ entryPoints: ['src/features/records/postureTimelineBrowser.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
  const { writeBrowserPostureTimeline: write, readBrowserPostureSummaries: read, clearBrowserPostureTimelines: clear } =
    await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
  const session = { id: 'sample', startedAt: 100, scorePolicyVersions: { neck: 'v3', shoulder: 'v3' }, habitPolicyVersion: 'v3' };
  const batch = { session, points: [{ second: 1, neck: 84, shoulder: null, neckValidMs: 500, shoulderValidMs: 0 }], endedAt: 1100 };
  await write({ ...batch, owner: '7' });
  await write({ ...batch, session: { ...session, id: 'ongoing' }, owner: '7', endedAt: null });
  await write({ ...batch, owner: '8' });
  assert.equal((await read('7', 0, 2000)).length, 1);
  assert.equal((await read('7', 101, 2000)).length, 0);
  await clear('7');
  assert.equal((await read('7', 0, 2000)).length, 0);
  assert.equal((await read('8', 0, 2000))[0].neck.meanPoints, 84);
});
