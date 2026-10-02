import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { RecordRepository } from '../../database/sqlite/repository.ts';

test('eye service retries immutable batches, flushes later observations, closes and discards deleted records', async t => {
  const db = new RecordRepository(':memory:'); t.after(() => db.close());
  const values = new Map([['postureAI.currentUserId', 'demo']]);
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  let closeHandler, fail = true, failGeneration = false; const writes = [];
  globalThis.window = { dispatchEvent() {}, motiRecords: {
    onClosing: handler => { closeHandler = handler; },
    generation: async owner => {
      if (failGeneration) { failGeneration = false; return { ok: false, error: 'generation failed' }; }
      return { ok: true, value: db.generation(owner) };
    },
    writeEye: async batch => {
      writes.push(structuredClone(batch));
      if (fail) { fail = false; return { ok: false, error: 'disk failed' }; }
      db.writeEye(batch); return { ok: true };
    },
  } };
  t.after(() => { delete globalThis.window; delete globalThis.localStorage; });
  const compiled = await build({ stdin: { contents: "export * from './src/features/eye/recording.ts'; export { retryRecordings, recordingMessage, discardDeletedRecordings } from './src/features/records/recording.ts';", resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'esm', write: false });
  const service = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const sink = service.beginEyeRecording();
  sink.sample(performance.now(), { validMs: 0, blinks: 1, nearReminder: true, openReminder: false });
  await assert.rejects(service.retryRecordings(), /disk/); assert.match(service.recordingMessage(), /저장 실패/);
  sink.sample(performance.now(), { validMs: 0, blinks: 2, nearReminder: true, openReminder: false });
  sink.rest(1); sink.finish(); await service.retryRecordings();
  assert.deepEqual(writes[0], writes[1]);
  const saved = db.eyeDetail('demo', writes[0].record.id);
  assert.equal(saved.record.blinks, 2); assert.equal(saved.record.breaks, 1);
  assert.equal(saved.record.nearReminders, 1); assert.equal(saved.record.status, 'finished');
  assert.equal(await closeHandler(), true);
  fail = true; const next = service.beginEyeRecording(); next.rest(1);
  assert.equal(await closeHandler(), false); const pending = writes.at(-1);
  assert.equal(await closeHandler(), true); assert.deepEqual(writes.at(-1), pending);
  fail = true; const deleted = service.beginEyeRecording(); deleted.rest(1);
  await assert.rejects(service.retryRecordings());
  db.clear('demo'); service.discardDeletedRecordings('demo');
  const count = writes.length; deleted.rest(2); deleted.finish(); await service.retryRecordings();
  assert.equal(writes.length, count);
  failGeneration = true; const recover = service.beginEyeRecording(); recover.finish();
  await assert.rejects(service.retryRecordings(), /generation/); await service.retryRecordings();
  assert.equal(writes.at(-1).generation, 1);
  assert.equal(db.eyeDetail('demo', writes.at(-1).record.id).record.status, 'finished');
});
