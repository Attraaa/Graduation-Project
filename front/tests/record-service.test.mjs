import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { RecordRepository } from '../../database/sqlite/repository.ts';
test('renderer retries the same failed batch and close flushes records before acknowledging', async () => {
  const db = new RecordRepository(':memory:');
  const values = new Map([['postureAI.currentUserId', 'demo']]);
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  let closeHandler; let fail = true; const writes = [];
  globalThis.window = { dispatchEvent() {}, motiRecords: {
    onClosing: handler => { closeHandler = handler; return () => {}; },
    generation: async owner => ({ ok: true, value: db.generation(owner) }),
    write: async batch => {
      writes.push(structuredClone(batch));
      if (fail) { fail = false; return { ok: false, error: 'temporary disk failure' }; }
      db.write(batch); return { ok: true };
    },
  }};
  const compiled = await build({ entryPoints: ['src/features/records/recording.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
  const service = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const at = performance.now();
  const sink = service.beginPostureRecording({ mode: 'turtle', scorePolicyVersion: 'v1', habitPolicyVersion: 'h1', at, epoch: 1800000000000 });
  sink.sample(at, { validMs: 0, scoreTimeSum: 0, currentScore: 100, deviationMs: 0, deviationEpisodeCount: 0 });
  sink.sample(at + 500, { validMs: 500, scoreTimeSum: 50000, currentScore: 100, deviationMs: 0, deviationEpisodeCount: 0 });
  sink.finish(at + 1000);
  await assert.rejects(service.retryRecordings(), /temporary/);
  assert.match(service.recordingMessage(), /저장 실패/);
  await service.retryRecordings();
  assert.deepEqual(writes[0], writes[1]);
  assert.equal(db.detail('demo', writes[0].record.id).record.status, 'finished');
  assert.equal(await closeHandler(), true);
  // A still-active recording must also flush on close; failure must veto the close.
  fail = true;
  const nextAt = performance.now();
  const activeSink = service.beginPostureRecording({ mode: 'shoulder', scorePolicyVersion: 'v1', habitPolicyVersion: 'h1', at: nextAt, epoch: 1800000060000 });
  activeSink.sample(nextAt, { validMs: 0, scoreTimeSum: 0, currentScore: 0, deviationMs: 0, deviationEpisodeCount: 0 });
  activeSink.sample(nextAt + 100, { validMs: 100, scoreTimeSum: 0, currentScore: 0, deviationMs: 0, deviationEpisodeCount: 0 });
  assert.equal(await closeHandler(), false);
  const failedCloseBatch = writes.at(-1);
  assert.throws(() => db.detail('demo', failedCloseBatch.record.id));
  assert.equal(await closeHandler(), true);
  assert.deepEqual(writes.at(-1), failedCloseBatch);
  assert.equal(db.detail('demo', failedCloseBatch.record.id).record.status, 'finished');
  db.close(); delete globalThis.window; delete globalThis.localStorage;
});
