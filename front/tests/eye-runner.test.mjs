import assert from 'node:assert/strict';
import test from 'node:test';
import { createEyeRunner } from '../src/features/eye/runner.ts';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
test('late camera permission after stop releases stream without loading a model', async () => {
  const d = deferred(); let stopped = 0;
  const runner = createEyeRunner({ camera: () => d.promise, stopCamera: () => {}, model: () => assert.fail('model must not load'), ready: () => assert.fail(), error: () => assert.fail() });
  const pending = runner.start(); runner.stop();
  d.resolve({ getTracks: () => [{ stop: () => stopped++ }] });
  await pending; assert.equal(stopped, 1);
});
test('late model after stop is closed and cannot start inference', async () => {
  const d = deferred(); let closed = 0;
  const runner = createEyeRunner({ camera: async () => ({}), stopCamera: () => {}, model: () => d.promise, ready: () => assert.fail(), error: () => assert.fail() });
  const pending = runner.start(); await Promise.resolve(); runner.stop();
  d.resolve({ close: () => closed++ }); await pending;
  assert.equal(closed, 1);
});
test('model failure releases camera and reports an actionable error', async () => {
  let stopped = 0; let error;
  const runner = createEyeRunner({ camera: async () => ({}), stopCamera: () => stopped++, model: async () => { throw Error('model missing'); }, ready: () => assert.fail(), error: e => { error = e; } });
  await runner.start(); assert.equal(stopped, 1); assert.equal(error.message, 'model missing');
});
test('normal stop closes the owned model only once', async () => {
  let closed = 0; let ready = 0;
  const runner = createEyeRunner({ camera: async () => ({}), stopCamera: () => {}, model: async () => ({ close: () => closed++ }), ready: async () => { ready++; }, error: () => assert.fail() });
  await runner.start(); runner.stop(); runner.stop();
  assert.equal(ready, 1); assert.equal(closed, 1);
});
