import { existsSync, readFileSync, realpathSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { app, dialog, type BrowserWindow } from 'electron';

export interface KeyboardSettings { apps: { name: string; path: string }[]; stopShortcut: string }
const blocked = /(?:valorant|league of legends|cs2|overwatch|tslgame|fortnite|vgc|vgtray)\.exe$/i;
const location = () => path.join(app.getPath('userData'), 'keyboard-settings.json');
export function readKeyboardSettings(): KeyboardSettings {
  try {
    const data = JSON.parse(readFileSync(location(), 'utf8')) as KeyboardSettings;
    if (!Array.isArray(data.apps) || data.apps.length > 32 || !/^Control\+Alt\+F(?:[1-9]|1[0-2])$/.test(data.stopShortcut)
      || data.apps.some(item => typeof item.path !== 'string' || !path.isAbsolute(item.path) || path.extname(item.path).toLowerCase() !== '.exe'
        || item.name !== path.basename(item.path) || blocked.test(item.name))) throw new Error('Invalid keyboard settings');
    return data;
  } catch (error) {
    if (existsSync(location())) throw new Error('키보드 관찰 설정을 읽을 수 없습니다. 설정 파일을 확인해 주세요.', { cause: error });
    return { apps: [], stopShortcut: 'Control+Alt+F8' };
  }
}
function save(settings: KeyboardSettings) {
  const temporary = `${location()}.tmp`;
  writeFileSync(temporary, JSON.stringify(settings), { mode: 0o600 }); renameSync(temporary, location());
  return settings;
}
export async function chooseKeyboardApp(window: BrowserWindow) {
  const result = await dialog.showOpenDialog(window, { title: '관찰을 승인할 일반 앱 선택', properties: ['openFile'], filters: [{ name: 'Windows 앱', extensions: ['exe'] }] });
  if (result.canceled) return readKeyboardSettings();
  const selected = realpathSync(result.filePaths[0]), name = path.basename(selected);
  if (selected.toLowerCase() === realpathSync(process.execPath).toLowerCase()) throw new Error('Moti 내부 입력은 학습 화면에서 이미 관찰합니다. 다른 일반 앱을 선택해 주세요.');
  if (path.extname(selected).toLowerCase() !== '.exe' || blocked.test(name)
    || /[\\/](?:steamapps|riot games|epic games|games)[\\/]/i.test(selected)) throw new Error('게임은 관찰 목록에 추가할 수 없습니다. 일반 앱을 선택해 주세요.');
  const settings = readKeyboardSettings();
  if (!settings.apps.some(item => item.path.toLowerCase() === selected.toLowerCase())) settings.apps.push({ path: selected, name });
  if (settings.apps.length > 32) throw new Error('승인 앱은 최대 32개입니다.');
  return save(settings);
}
export function updateKeyboardSettings(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('잘못된 키보드 설정입니다.');
  const row = input as Record<string, unknown>;
  if (Object.keys(row).some(key => !['removePath', 'stopShortcut'].includes(key))) throw new Error('지원하지 않는 설정입니다.');
  const settings = readKeyboardSettings();
  if (row.removePath !== undefined) {
    if (typeof row.removePath !== 'string') throw new Error('잘못된 승인 앱입니다.');
    settings.apps = settings.apps.filter(item => item.path !== row.removePath);
  }
  if (row.stopShortcut !== undefined) {
    if (typeof row.stopShortcut !== 'string' || !/^Control\+Alt\+F(?:[1-9]|1[0-2])$/.test(row.stopShortcut)) throw new Error('단축키는 Ctrl+Alt+F1~F12 중에서 선택해 주세요.');
    settings.stopShortcut = row.stopShortcut;
  }
  return save(settings);
}
