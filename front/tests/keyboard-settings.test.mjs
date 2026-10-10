import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['electron/keyboardSettings.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['electron'] });
const require = createRequire(import.meta.url);
function settingsFor(t) {
  const cache = path.resolve('.moti-cache');
  mkdirSync(cache, { recursive: true });
  const profile = mkdtempSync(path.join(cache, 'keyboard-settings-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(profile)), cache);
    rmSync(profile, { recursive: true, force: true });
  });
  const compiled = { exports: {} };
  new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports,
    name => name === 'electron' ? { app: { getPath: () => profile } } : require(name));
  return { ...compiled.exports, file: path.join(profile, 'keyboard-settings.json'), profile };
}

test('legacy stop shortcuts are ignored without dropping approved apps, and the next save removes the field', t => {
  const settings = settingsFor(t);
  const apps = ['editor.exe', 'notes.exe'].map(name => ({ name, path: path.join(settings.profile, name) }));
  writeFileSync(settings.file, JSON.stringify({ apps, stopShortcut: 'Control+Alt+F8' }));
  assert.deepEqual(settings.readKeyboardSettings(), { apps });
  assert.deepEqual(settings.updateKeyboardSettings({ removePath: apps[0].path }), { apps: [apps[1]] });
  assert.deepEqual(JSON.parse(readFileSync(settings.file, 'utf8')), { apps: [apps[1]] });
});

test('new settings need no stop shortcut and still reject unsupported updates and invalid approval paths', t => {
  const settings = settingsFor(t);
  assert.deepEqual(settings.readKeyboardSettings(), { apps: [] });
  assert.throws(() => settings.updateKeyboardSettings({ stopShortcut: 'Control+Alt+F9' }), /지원하지 않는 설정/);
  writeFileSync(settings.file, JSON.stringify({ apps: [{ name: 'editor.exe', path: 'relative.exe' }] }));
  assert.throws(() => settings.readKeyboardSettings(), /설정을 읽을 수 없습니다/);
});
