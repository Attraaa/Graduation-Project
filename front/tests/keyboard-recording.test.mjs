import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { RecordRepository } from '../../database/sqlite/repository.ts';

test('keyboard save retries immutable aggregates, includes concurrent presses at finish, flushes on close, and respects deletion', async t => {
  const db = new RecordRepository(':memory:'); t.after(() => db.close());
  const values = new Map([['postureAI.currentUserId', 'demo']]);
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  let closeHandler, fail = true, failGeneration = false; const writes = [];
  globalThis.window = { dispatchEvent() {}, motiRecords: {
    onClosing: handler => { closeHandler = handler; },
    generation: async owner => {
      if (failGeneration) { failGeneration = false; return { ok: false, error: 'temporary generation failure' }; }
      return { ok: true, value: db.generation(owner) };
    },
    writeKeyboard: async batch => {
      writes.push(structuredClone(batch));
      if (fail) { fail = false; return { ok: false, error: 'temporary disk failure' }; }
      db.writeKeyboard(batch); return { ok: true };
    },
  }};
  t.after(() => { delete globalThis.window; delete globalThis.localStorage; });
  const compiled = await build({ stdin: { contents: "export * from './src/features/keyboard/recording.ts'; export { retryRecordings, recordingMessage, discardDeletedRecordings } from './src/features/records/recording.ts';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false });
  const service = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const press = id => ({ id, code: 'KeyA', context: 'plain', evaluation: { observed: 'left:ring', verdict: 'nearby', reason: 'neighboring-finger' } });
  const sink = service.beginKeyboardRecording();
  for (let i = 0; i < 10; i++) sink.press(press(i)); sink.press(press(9));
  await assert.rejects(service.retryRecordings(), /temporary/); assert.match(service.recordingMessage(), /저장 실패/);
  sink.press(press(10)); sink.finish(); await service.retryRecordings();
  assert.deepEqual(writes[0], writes[1]);
  const saved = db.keyboardDetail('demo', writes[0].record.id);
  assert.equal(saved.record.total, 11); assert.equal(saved.counts.length, 1); assert.equal(saved.counts[0].count, 11);
  assert.equal(saved.record.status, 'finished'); assert.equal(await closeHandler(), true);
  fail = true; const next = service.beginKeyboardRecording(); next.press(press(1));
  assert.equal(await closeHandler(), false);
  const pending = writes.at(-1); assert.equal(await closeHandler(), true); assert.deepEqual(writes.at(-1), pending);
  assert.equal(db.keyboardDetail('demo', pending.record.id).record.status, 'finished');
  fail = true; const deleted = service.beginKeyboardRecording(); deleted.press(press(1));
  await assert.rejects(service.retryRecordings());
  db.clear('demo'); service.discardDeletedRecordings('demo');
  const n = writes.length; deleted.press(press(2)); deleted.finish(); await service.retryRecordings();
  assert.equal(writes.length, n); assert.equal(db.keyboardStatistics({ owner: 'demo', from: '2026-01-01', to: '2026-12-31' }).length, 0);
  failGeneration = true; const recover = service.beginKeyboardRecording(); recover.press(press(1)); recover.finish();
  await assert.rejects(service.retryRecordings(), /generation/);
  await service.retryRecordings();
  assert.equal(db.keyboardDetail('demo', writes.at(-1).record.id).record.total, 1);
  assert.equal(writes.at(-1).generation, 1);
});
