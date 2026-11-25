import test from 'node:test';
import assert from 'node:assert/strict';
import { readBalanceSensitivity, readBaseCva, readEyeSensitivity, writeBalanceSensitivity, writeBaseCva, writeEyeSensitivity } from '../src/features/settings/preferences.ts';

const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, String(value)); } };
};

test('sensitivities default to the unchanged rules and ignore the old sliders (unused value, removed posture-collapse slider)', () => {
  const store = memory({ 'postureAI.collapseSensitivity': '20', 'moti.settings.postureSensitivity': '80' });
  assert.equal(readBalanceSensitivity(store), 50);
  assert.equal(readEyeSensitivity(store), 'normal');
});

test('each mode reads back its own stored sensitivity in the form its rule accepts', () => {
  const store = memory();
  writeBalanceSensitivity(73, store);
  writeEyeSensitivity('high', store);
  assert.deepEqual([...store.data], [['moti.settings.balanceSensitivity', '70'], ['moti.settings.eyeSensitivity', 'high']]);
  assert.equal(readBalanceSensitivity(store), 70);
  assert.equal(readEyeSensitivity(store), 'high');
  writeBalanceSensitivity(50, store);
  assert.equal(readBalanceSensitivity(store), 50);
  assert.equal(readEyeSensitivity(store), 'high');
});

test('unknown or unreadable stored values fall back to the defaults', () => {
  const store = memory({ 'moti.settings.balanceSensitivity': 'loud', 'moti.settings.eyeSensitivity': 'extreme' });
  assert.equal(readBalanceSensitivity(store), 50);
  assert.equal(readEyeSensitivity(store), 'normal');
  const broken = { getItem() { throw new Error('storage blocked'); }, setItem() {} };
  assert.equal(readBalanceSensitivity(broken), 50);
  assert.equal(readEyeSensitivity(broken), 'normal');
});

test('the base CVA for the on-screen estimate is a whole degree between 40 and 60, 50 by default', () => {
  const store = memory();
  assert.equal(readBaseCva(store), 50);
  writeBaseCva(52.4, store);
  assert.deepEqual([...store.data], [['moti.settings.baseCva', '52']]);
  assert.equal(readBaseCva(store), 52);
  for (const [stored, value] of [['30', 40], ['75', 60], ['abc', 50], ['', 50]]) assert.equal(readBaseCva(memory({ 'moti.settings.baseCva': stored })), value);
  assert.equal(readBaseCva({ getItem() { throw new Error('storage blocked'); } }), 50);
});
