import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeMediaPipe } from '../src/features/session/mediaPipeInitialization.ts';

test('Tasks never receives an initialized Pose module and concurrent initializations are ordered', async () => {
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  const order = [];
  const legacy = {};
  Object.defineProperty(legacy, 'noExitRuntime', { get() { throw new Error('old Pose runtime accessed'); } });
  const pose = initializeMediaPipe(async () => {
    order.push('pose-start');
    globalThis.Module = legacy;
    await ready;
    assert.equal(globalThis.Module, legacy);
    order.push('pose-finish');
  });
  const face = initializeMediaPipe(async () => {
    order.push('face-start');
    assert.equal(globalThis.Module, undefined);
    assert.equal(globalThis.ModuleFactory, undefined);
    globalThis.Module = { partial: true };
    return 'face';
  }, true);
  await Promise.resolve();
  assert.deepEqual(order, ['pose-start']);
  release();
  assert.deepEqual(await Promise.all([pose, face]), [undefined, 'face']);
  assert.deepEqual(order, ['pose-start', 'pose-finish', 'face-start']);
  assert.equal(globalThis.Module, undefined);
});

test('failed Tasks initialization cleans globals and does not block retry or return to Pose', async () => {
  await assert.rejects(initializeMediaPipe(async () => {
    globalThis.Module = { failed: true };
    globalThis.ModuleFactory = () => {};
    throw new Error('model load failed');
  }, true), /model load failed/);
  assert.equal(globalThis.Module, undefined);
  assert.equal(globalThis.ModuleFactory, undefined);
  assert.equal(await initializeMediaPipe(async () => 'retry', true), 'retry');
  assert.equal(await initializeMediaPipe(async () => 'pose'), 'pose');
});
