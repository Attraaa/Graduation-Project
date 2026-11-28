import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['electron/keyboardSettings.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['electron'] });
const require = createRequire(import.meta.url);
function settingsFor(t, electron = {}) {
  const cache = path.resolve('.moti-cache');
  mkdirSync(cache, { recursive: true });
  const profile = mkdtempSync(path.join(cache, 'keyboard-settings-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(profile)), cache);
    rmSync(profile, { recursive: true, force: true });
  });
  const compiled = { exports: {} };
  new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports,
    name => name === 'electron' ? { ...electron, app: { getPath: () => profile, ...electron.app } } : require(name));
  return { ...compiled.exports, file: path.join(profile, 'keyboard-settings.json'), profile };
}
const program = (settings, name) => { const file = path.join(settings.profile, name); writeFileSync(file, ''); return realpathSync(file); };

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

test('open apps show one row per windowed program and leave out Windows, Moti and games', t => {
  const { openAppsFrom } = settingsFor(t);
  const chrome = { path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', title: 'Google Chrome' };
  const rows = [chrome, chrome, { path: 'C:\\Windows\\explorer.exe', title: 'Windows Explorer' }, { path: 'C:\\Moti\\Moti.exe', title: 'Moti' },
    { path: 'C:\\Riot Games\\VALORANT\\live\\VALORANT.exe', title: 'VALORANT' }, { path: 'D:\\Games\\Puzzle\\puzzle.exe', title: 'Puzzle' },
    { path: 'C:\\Tools\\notes.exe', title: ' ' }, { path: 'relative.exe', title: 'Relative' }, { path: 'C:\\Tools\\readme.txt', title: 'Text' }, { title: 'No path' }];
  const apps = openAppsFrom(rows, 'C:\\Moti\\Moti.exe', 'C:\\Windows', ['c:\\tools\\NOTES.exe']);
  assert.deepEqual(apps.map(app => [app.title, app.name, app.approved]), [['Google Chrome', 'chrome.exe', false], ['notes', 'notes.exe', true]]);
  // PowerShell prints one object instead of a list when a single program has a window, and nothing when none does.
  assert.equal(openAppsFrom(chrome, 'C:\\Moti\\Moti.exe', 'C:\\Windows', []).length, 1);
  assert.deepEqual(openAppsFrom('', 'C:\\Moti\\Moti.exe', 'C:\\Windows', []), []);
});

test('an open app is approved only from the list main showed last', async t => {
  const settings = settingsFor(t, { app: { getFileIcon: async () => ({ toDataURL: () => 'data:image/png;base64,AA==' }) } });
  const editor = program(settings, 'editor.exe'), other = program(settings, 'other.exe');
  assert.throws(() => settings.approveOpenApp(editor), /다시 불러온 뒤/);
  assert.deepEqual(await settings.listOpenApps(async () => [{ path: editor, title: 'Editor' }]),
    [{ name: 'editor.exe', path: editor, title: 'Editor', approved: false, icon: 'data:image/png;base64,AA==' }]);
  for (const refused of [other, 42, null]) assert.throws(() => settings.approveOpenApp(refused), /다시 불러온 뒤/);
  assert.deepEqual(settings.approveOpenApp(editor), { apps: [{ path: editor, name: 'editor.exe' }] });
  assert.equal((await settings.listOpenApps(async () => ({ path: editor, title: 'Editor' })))[0].approved, true);
});

test('a shortcut is approved as the program it starts; shortcuts without a program are refused', async t => {
  let picked = '';
  const links = {};
  const settings = settingsFor(t, {
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [picked] }) },
    shell: { readShortcutLink: file => { if (!links[file]) throw new Error('not a shortcut'); return links[file]; } },
  });
  const editor = program(settings, 'editor.exe'), shortcut = path.join(settings.profile, 'Editor.lnk'), store = path.join(settings.profile, 'Store app.lnk');
  links[shortcut] = { target: editor };
  links[store] = { target: '' };
  picked = shortcut;
  assert.deepEqual(await settings.chooseKeyboardApp(null), { apps: [{ path: editor, name: 'editor.exe' }] });
  for (const file of [store, path.join(settings.profile, 'broken.lnk')]) {
    picked = file;
    await assert.rejects(settings.chooseKeyboardApp(null), /바로가기는 앱 실행 파일을 가리키지 않아요/);
  }
  picked = program(settings, 'notes.txt');
  await assert.rejects(settings.chooseKeyboardApp(null), /\.exe/);
  assert.equal(settings.shortcutTarget(editor), editor);
});
