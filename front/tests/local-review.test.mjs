import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { build } from 'esbuild';
import { loggedIn } from './fixtures/memory-records.mjs';
import { createPostureScoreTimeline } from '../src/features/posture/scoreTimeline.ts';
import { readReviewSession } from '../src/features/records/reviewSession.ts';

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

test('older summary files still enforce the date range and validate scores', () => {
  assert.equal(readReviewSession(raw(10, 'v3', 80, 1000), 0, 100)?.neck.meanPoints, 80);
  assert.equal(readReviewSession(raw(10, 'v3', 80, 1000), 11, 100), null);
  assert.equal(readReviewSession(raw(10, 'v3', 102, 100), 0, 100), null);
});

test('daily posture cuts midnight, deduplicates synced sessions and compares the last ten accumulated minutes', async () => {
  const compiled = await build({ entryPoints: ['src/features/records/dailyPostureReview.ts'],
    bundle: true, write: false, platform: 'node', format: 'esm' });
  const { summarizePostureDay } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const from = new Date('2026-11-21T00:00:00+09:00').getTime();
  const minute = 60_000, to = from + 1440 * minute;
  const id = '10223344-5566-7788-99aa-bbccddeeff01';
  const local = {
    id, startedAt: from - 5 * minute, endedAt: from + 10 * minute,
    scorePolicyVersions: { neck: 'neck-v1', shoulder: 'upper-body-balance-v1' },
    neck: { validMs: 15 * minute, meanPoints: 80, mostObservedBand: null },
    shoulder: { validMs: 0, meanPoints: null, mostObservedBand: null },
    points: Array.from({ length: 900 }, (_, i) => ({ second: i + 1, neck: i < 300 ? 20 : 90,
      neckValidMs: 1000, shoulder: null, shoulderValidMs: 0 })),
  };
  const detail = (recordId, start, length, score, policy = 'neck-v1') => ({
    record: { id: recordId, startedAt: start, updatedAt: start + length * minute, mode: 'turtle', scorePolicyVersion: policy },
    buckets: Array.from({ length }, (_, i) => ({ minute: start + i * minute, validMs: minute, scoreTimeSum: score * minute })),
  });
  const cloud = [detail('camera:8a0f425c-2d5e-4d22-a572-a8e7c165bbf4:' + id + ':turtle', from, 10, 20),
    detail('lunch:turtle', from + 720 * minute, 10, 90), detail('night:turtle', to - 10 * minute, 20, 60)];
  const { sessions, measuredMinutes, scores } = summarizePostureDay([local], cloud, from, to);
  assert.equal(sessions, 3);
  assert.equal(measuredMinutes, 30);
  assert.equal(scores[0].mean, 80);
  assert.deepEqual(scores[0].beforeLastTen, { mean: 90, validMinutes: 20 });
  assert.deepEqual(scores[0].lastTen, { mean: 60, validMinutes: 10 });
  assert.deepEqual(scores[0].periods.map(p => p.mean), [90, 90, 90, 90, 60, 60]);

  cloud[2].record.scorePolicyVersion = 'neck-v2';
  const changed = summarizePostureDay([local], cloud, from, to);
  assert.equal(changed.sessions, 3);
  assert.equal(changed.scores[0].mean, 60);
  assert.equal(changed.scores[0].beforeLastTen, null);
  assert.equal(changed.scores[0].lastTen, null);
  assert.deepEqual(changed.scores[0].periods, []);
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
  assert.equal(result.eye.length, 1);
  assert.match(result.eye[0].id, /^[\da-f-]{36}$/);
  assert.equal(result.eye[0].rows.reduce((n, bucket) => n + bucket.validMs, 0), 60_000);
  assert.equal(result.eye[0].rows.reduce((n, bucket) => n + bucket.blinks, 0), 12);
  assert.equal(result.keyboard[0].counts[0].count, 1);
  assert.deepEqual(await read('43'), { eye: [], keyboard: [] });
  await local.clearLocalReviewResults('42');
  assert.deepEqual(await read('42'), { eye: [], keyboard: [] });
});

test('browser review reads completed summaries only, isolates owners, and clears only the selected account', async () => {
  const built = await build({ entryPoints: ['src/features/records/postureTimelineBrowser.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
  const { writeBrowserPostureTimeline: write, readBrowserPostureSummaries: read, readBrowserPostureDay: readDay, clearBrowserPostureTimelines: clear } =
    await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
  const session = { id: '10223344-5566-7788-99aa-bbccddeeff01', startedAt: 100, scorePolicyVersions: { neck: 'v3', shoulder: 'v3' }, habitPolicyVersion: 'v3' };
  const batch = { session, points: [{ second: 1, neck: 84, shoulder: null, neckValidMs: 500, shoulderValidMs: 0 }], endedAt: 1100 };
  await write({ ...batch, owner: '7' });
  await write({ ...batch, session: { ...session, id: 'ongoing' }, owner: '7', endedAt: null });
  await write({ ...batch, owner: '8' });
  assert.equal((await read('7', 0, 2000)).length, 1);
  assert.equal((await read('7', 101, 2000)).length, 0);
  const day = await readDay('7', 101, 2000);
  assert.equal(day.length, 1);
  assert.equal(day[0].points[0].neck, 84);
  await clear('7');
  assert.equal((await read('7', 0, 2000)).length, 0);
  assert.equal((await read('8', 0, 2000))[0].neck.meanPoints, 84);
});
