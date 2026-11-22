import test from 'node:test';
import assert from 'node:assert/strict';
import { readBaseCva, readEyeSensitivity, readPostureSensitivity, writeBaseCva, writeEyeSensitivity, writePostureSensitivity } from '../src/features/settings/preferences.ts';

const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, String(value)); } };
};

test('sensitivities default to the unchanged rules and ignore the old unused slider value', () => {
  const store = memory({ 'postureAI.collapseSensitivity': '20' });
  assert.equal(readPostureSensitivity(store), 50);
  assert.equal(readEyeSensitivity(store), 'normal');
});

test('each mode reads back its own stored sensitivity in the form its rule accepts', () => {
  const store = memory();
  writePostureSensitivity(73, store);
  writeEyeSensitivity('high', store);
  assert.deepEqual([...store.data], [['moti.settings.postureSensitivity', '70'], ['moti.settings.eyeSensitivity', 'high']]);
  assert.equal(readPostureSensitivity(store), 70);
  assert.equal(readEyeSensitivity(store), 'high');
  writePostureSensitivity(50, store);
  assert.equal(readPostureSensitivity(store), 50);
  assert.equal(readEyeSensitivity(store), 'high');
});

test('unknown or unreadable stored values fall back to the defaults', () => {
  const store = memory({ 'moti.settings.postureSensitivity': 'loud', 'moti.settings.eyeSensitivity': 'extreme' });
  assert.equal(readPostureSensitivity(store), 50);
  assert.equal(readEyeSensitivity(store), 'normal');
  const broken = { getItem() { throw new Error('storage blocked'); }, setItem() {} };
  assert.equal(readPostureSensitivity(broken), 50);
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
