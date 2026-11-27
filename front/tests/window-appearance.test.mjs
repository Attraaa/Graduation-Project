import assert from 'node:assert/strict';
import test from 'node:test';
import { windowAppearance } from '../electron/windowAppearance.ts';

test('native window theme accepts only the two app themes', () => {
  for (const theme of ['light', 'dark']) assert.doesNotThrow(() => windowAppearance(theme));
  for (const input of [null, undefined, true, {}, '#000000', 'Dark']) assert.throws(() => windowAppearance(input));
});

test('native caption uses the modal tint in light and dark and restores the normal colors after close', () => {
  for (const [theme, background, symbols] of [['light', '#acaeb3', '#19202f'], ['dark', '#151a24', '#9ba0a9']]) {
    const normal = windowAppearance(theme);
    const dimmed = windowAppearance(theme, true);
    assert.deepEqual(dimmed.titleBarOverlay, { color: background, symbolColor: symbols, height: 36 });
    assert.equal(dimmed.backgroundColor, normal.backgroundColor);
    assert.deepEqual(windowAppearance(theme, false), normal);
  }
});
