import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleAnalysisFrame } from '../src/features/session/analysisFrame.ts';

test('native analysis progresses when RAF never fires and cancellation releases pending work', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { motiDesktop: {} } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'window', original); else delete globalThis.window; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  scheduleAnalysisFrame(() => calls++);
  t.mock.timers.tick(29); assert.equal(calls, 0);
  t.mock.timers.tick(1); assert.equal(calls, 1);
  const cancel = scheduleAnalysisFrame(() => calls++); cancel();
  t.mock.timers.tick(1000); assert.equal(calls, 1);
});
