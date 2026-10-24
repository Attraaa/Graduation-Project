import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { MemoryRecords, memoryServer, loggedIn } from './fixtures/memory-records.mjs';

const compiled = await build({ stdin: { contents: "export * from './src/features/records/recording.ts'; export { beginEyeRecording } from './src/features/eye/recording.ts'; export { beginKeyboardRecording } from './src/features/keyboard/recording.ts'; export * from './src/features/records/refresh.ts';", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error' });
const service = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
// Longer than the 300 ms window that merges the records of one session into one reload.
const settle = () => new Promise(resolve => setTimeout(resolve, 400));
const press = id => ({ id, code: 'KeyA', context: 'plain', evaluation: { observed: 'left:ring', verdict: 'nearby', reason: 'neighboring-finger' } });

test('open record screens reload once after a finished measurement is saved, never for running batches', async t => {
  const db = new MemoryRecords(), server = memoryServer(db, '7'), originalFetch = globalThis.fetch;
  globalThis.fetch = server.fetch; globalThis.localStorage = loggedIn('7'); globalThis.window = { dispatchEvent: () => true };
  t.after(() => { globalThis.fetch = originalFetch; delete globalThis.window; delete globalThis.localStorage; });
  let reloads = 0;
  t.after(service.subscribeRecordsChanged(() => { reloads += 1; }));

  const at = performance.now(), epoch = Date.now();
  const parts = ['turtle', 'shoulder'].map(mode => service.beginPostureRecording({ id: `session:${mode}`, mode, scorePolicyVersion: 'v1', habitPolicyVersion: 'h1', at, epoch }));
  for (const part of parts) {
    part.sample(at, { validMs: 0, scoreTimeSum: 0, currentScore: 90, deviationMs: 0, deviationEpisodeCount: 0 });
    part.sample(at + 500, { validMs: 500, scoreTimeSum: 45000, currentScore: 90, deviationMs: 0, deviationEpisodeCount: 0 });
  }
  const eye = service.beginEyeRecording();
  eye.sample(performance.now(), { validMs: 0, blinks: 1, nearReminder: false, openReminder: false });
  await service.retryRecordings(); await settle();
  assert.equal(reloads, 0);

  const revision = service.recordsRevision();
  parts.forEach(part => part.finish(at + 1000)); eye.finish();
  await service.retryRecordings(); await settle();
  assert.equal(reloads, 1);
  assert.equal(service.recordsRevision(), revision + 1);

  // A failed last save reloads nothing until a retry finally stores it.
  const keys = service.beginKeyboardRecording(); keys.press(press(1));
  server.fail('/api/records/keyboard', 'offline');
  keys.finish();
  await assert.rejects(service.retryRecordings(), /offline/); await settle();
  assert.equal(reloads, 1);
  await service.retryRecordings(); await settle();
  assert.equal(reloads, 2);
});
