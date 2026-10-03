import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { MemoryRecords, memoryServer, loggedIn } from './fixtures/memory-records.mjs';

test('eye service retries immutable batches, flushes later observations, closes and discards deleted records', async t => {
  const db = new MemoryRecords(), server = memoryServer(db, '7'), { writes } = server, originalFetch = globalThis.fetch;
  const fail = () => server.fail('/api/records/eye', 'temporary server failure');
  globalThis.localStorage = loggedIn('7'); globalThis.fetch = server.fetch;
  let closeHandler; fail();
  globalThis.window = { dispatchEvent() {}, motiRecords: { onClosing: handler => { closeHandler = handler; } } };
  t.after(() => { globalThis.fetch = originalFetch; delete globalThis.window; delete globalThis.localStorage; });
  const compiled = await build({ stdin: { contents: "export * from './src/features/eye/recording.ts'; export { retryRecordings, recordingMessage, discardDeletedRecordings } from './src/features/records/recording.ts';", resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'esm', write: false });
  const service = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const sink = service.beginEyeRecording();
  sink.sample(performance.now(), { validMs: 0, blinks: 1, nearReminder: true, openReminder: false });
  await assert.rejects(service.retryRecordings(), /temporary/); assert.match(service.recordingMessage(), /저장 실패/);
  sink.sample(performance.now(), { validMs: 0, blinks: 2, nearReminder: true, openReminder: false });
  sink.rest(1); sink.finish(); await service.retryRecordings();
  assert.deepEqual(writes[0], writes[1]);
  const saved = db.eyeDetail('7', writes[0].record.id);
  assert.equal(saved.record.blinks, 2); assert.equal(saved.record.breaks, 1);
  assert.equal(saved.record.nearReminders, 1); assert.equal(saved.record.status, 'finished');
  assert.equal(await closeHandler(), true);
  fail(); const next = service.beginEyeRecording(); next.rest(1);
  assert.equal(await closeHandler(), false); const pending = writes.at(-1);
  assert.equal(await closeHandler(), true); assert.deepEqual(writes.at(-1), pending);
  fail(); const deleted = service.beginEyeRecording(); deleted.rest(1);
  await assert.rejects(service.retryRecordings());
  db.clear('7'); service.discardDeletedRecordings('7');
  const count = writes.length; deleted.rest(2); deleted.finish(); await service.retryRecordings();
  assert.equal(writes.length, count);
  server.fail('/api/records/generation', 'temporary generation failure'); const recover = service.beginEyeRecording(); recover.finish();
  await assert.rejects(service.retryRecordings(), /generation/); await service.retryRecordings();
  assert.equal(writes.at(-1).generation, 1);
  assert.equal(db.eyeDetail('7', writes.at(-1).record.id).record.status, 'finished');
  // Electron only supplies the close signal; a signed-in browser also uses the server.
  delete globalThis.window.motiRecords;
  const browser = service.beginEyeRecording(); browser.rest(1); browser.finish(); await service.retryRecordings();
  assert.equal(db.eyeDetail('7', writes.at(-1).record.id).record.breaks, 1);
  globalThis.localStorage.removeItem('moti.session');
  const before = writes.length, anonymous = service.beginEyeRecording(); anonymous.rest(1); anonymous.finish(); await service.retryRecordings();
  assert.equal(writes.length, before); assert.match(service.recordingMessage(), /저장되지/);
});
