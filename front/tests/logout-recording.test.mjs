import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { MemoryRecords, memoryServer, loggedIn } from './fixtures/memory-records.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const compiled = await build({ stdin: { contents: "export * from './src/features/records/recording.ts'; export { beginEyeRecording } from './src/features/eye/recording.ts'; export { logoutAfterSaving } from './src/utils/authStore.ts';", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error' });
const service = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

/** Signed in as 7 against a store that, like the real server, rejects requests without the login token. */
function signedIn(t) {
  const db = new MemoryRecords(), server = memoryServer(db, '7'), originalFetch = globalThis.fetch, events = [];
  let anonymous = 0;
  globalThis.fetch = async (url, init = {}) => {
    if (init.headers?.Authorization) return server.fetch(url, init);
    anonymous += 1;
    return json(401, { message: '인증이 필요합니다.' });
  };
  globalThis.localStorage = loggedIn('7');
  globalThis.window = { dispatchEvent: event => { events.push(event.type); return true; } };
  t.after(() => { globalThis.fetch = originalFetch; delete globalThis.window; delete globalThis.localStorage; });
  return { db, server, events, anonymous: () => anonymous };
}
const posture = (mode, at) => {
  const sink = service.beginPostureRecording({ mode, scorePolicyVersion: 'v1', habitPolicyVersion: 'h1', at, epoch: Date.now() });
  sink.sample(at, { validMs: 0, scoreTimeSum: 0, currentScore: 90, deviationMs: 0, deviationEpisodeCount: 0 });
  sink.sample(at + 500, { validMs: 500, scoreTimeSum: 45000, currentScore: 90, deviationMs: 0, deviationEpisodeCount: 0 });
  return sink;
};

test('logging out during a measurement stops it and saves the last batches with the login before clearing it', async t => {
  const { db, server, events, anonymous } = signedIn(t);
  const upper = posture('turtle', performance.now());
  const eye = service.beginEyeRecording();
  eye.sample(performance.now(), { validMs: 0, blinks: 2, nearReminder: false, openReminder: false });
  let asked = false;
  assert.equal(await service.logoutAfterSaving(async () => { asked = true; return true; }), true);
  assert.equal(asked, false);
  assert.deepEqual(events, ['moti-stop-measurement']);
  assert.equal(globalThis.localStorage.getItem('moti.session'), null);
  assert.equal(anonymous(), 0);
  const saved = mode => server.writes.findLast(batch => (batch.record.mode ?? 'keyboard') === mode).record.id;
  assert.equal(db.detail('7', saved('turtle')).record.status, 'finished');
  const eyeRecord = db.eyeDetail('7', saved('eye')).record;
  assert.equal(eyeRecord.status, 'finished');
  assert.equal(eyeRecord.blinks, 2);
  // Leaving the app screens unmounts the monitors, which finish their sinks again; nothing more is sent.
  const sent = server.writes.length;
  upper.finish(performance.now()); eye.finish(); await service.retryRecordings();
  assert.equal(server.writes.length, sent);
  assert.equal(anonymous(), 0);
});

test('a failed last save asks first: staying keeps the login and the retry, leaving drops what was not saved', async t => {
  const { server } = signedIn(t);
  posture('shoulder', performance.now());
  server.fail('/api/records/posture', 'network down');
  assert.equal(await service.logoutAfterSaving(async () => false), false);
  assert.notEqual(globalThis.localStorage.getItem('moti.session'), null);
  assert.match(service.recordingMessage(), /저장 실패: network down/);

  server.fail('/api/records/posture', 'network down');
  assert.equal(await service.logoutAfterSaving(async () => true), true);
  assert.equal(globalThis.localStorage.getItem('moti.session'), null);
  assert.doesNotMatch(service.recordingMessage(), /저장 실패/);
  // The next account never retries or sees the previous account's unsaved record.
  globalThis.localStorage = loggedIn('8');
  const sent = server.writes.length;
  await service.retryRecordings();
  assert.equal(server.writes.length, sent);
});
