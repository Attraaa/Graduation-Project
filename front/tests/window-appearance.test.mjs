import assert from 'node:assert/strict';
import test from 'node:test';
import { windowAppearance } from '../electron/windowAppearance.ts';

test('native window theme accepts only the two app themes', () => {
  for (const theme of ['light', 'dark']) assert.doesNotThrow(() => windowAppearance(theme));
  for (const input of [null, undefined, true, {}, '#000000', 'Dark']) assert.throws(() => windowAppearance(input));
});
