import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { waitForKeyboardReady } from '../electron/keyboardReady.ts';

const child = () => Object.assign(new EventEmitter(), { stdout: new PassThrough(), exitCode: null, signalCode: null });

test('readiness comes only from the selected child, after a valid bound port', async () => {
  const before = child(), current = child();
  const stale = waitForKeyboardReady(before, 250);
  before.emit('exit');
  await assert.rejects(stale, /준비 중에 종료/);
  const binding = waitForKeyboardReady(current, 250);
  before.stdout.write('MOTI_KEYBOARD_READY 4848\n');
  current.stdout.write('starting model\r\nMOTI_KEYBOARD_READY 70000\nMOTI_KEY');
  current.stdout.write('BOARD_READY 49000\r\n');
  assert.equal(await binding, 49000);
});

test('spawn errors and preparation timeouts produce retryable errors', async () => {
  const missing = child();
  const startup = waitForKeyboardReady(missing, 50);
  missing.emit('error', Error('fixture path'));
  await assert.rejects(startup, /설치 상태/);
  await assert.rejects(waitForKeyboardReady(child(), 10), /준비 시간/);
});

test('the child can finish after the original deadline when both models make progress', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const process = child();
  let connected = false;
  const binding = waitForKeyboardReady(process, 45).then(port => { connected = true; return port; });

  t.mock.timers.tick(40);
  process.stdout.write('MOTI_KEYBOARD_LOADING hands\n');
  t.mock.timers.tick(40);
  process.stdout.write('MOTI_KEYBOARD_LOADING layout\n');
  t.mock.timers.tick(40);
  await Promise.resolve();
  assert.equal(connected, false);
  process.stdout.write('MOTI_KEYBOARD_READY 49001\n');
  assert.equal(await binding, 49001);
});

test('duplicate, out-of-order and other child output cannot extend a stalled model', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const process = child(), previous = child(), wrongOrder = child();
  const timeout = assert.rejects(waitForKeyboardReady(process, 45), /준비 시간/);
  const orderTimeout = assert.rejects(waitForKeyboardReady(wrongOrder, 45), /준비 시간/);

  process.stdout.write('MOTI_KEYBOARD_LOADING hands\nMOTI_KEYBOARD_LOADING layout\n');
  t.mock.timers.tick(40);
  previous.stdout.write('MOTI_KEYBOARD_READY 49000\n');
  process.stdout.write('MOTI_KEYBOARD_LOADING layout\nMOTI_KEYBOARD_LOADING hands\n');
  wrongOrder.stdout.write('MOTI_KEYBOARD_LOADING layout\n');
  t.mock.timers.tick(5);
  await Promise.all([timeout, orderTimeout]);
});
