import { execFile } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { app, dialog, shell, type BrowserWindow } from 'electron';

export interface KeyboardSettings { apps: { name: string; path: string }[] }
/** A program that has a window now, so people can approve it without finding its .exe. */
export interface OpenApp { name: string; path: string; title: string; approved: boolean; icon: string | null }
const blocked = /(?:valorant|league of legends|cs2|overwatch|tslgame|fortnite|vgc|vgtray)\.exe$/i;
const gameFolder = /[\\/](?:steamapps|riot games|epic games|games)[\\/]/i;
const location = () => path.join(app.getPath('userData'), 'keyboard-settings.json');
export function readKeyboardSettings(): KeyboardSettings {
  try {
    const data = JSON.parse(readFileSync(location(), 'utf8')) as KeyboardSettings;
    if (!Array.isArray(data.apps) || data.apps.length > 32
      || data.apps.some(item => typeof item.path !== 'string' || !path.isAbsolute(item.path) || path.extname(item.path).toLowerCase() !== '.exe'
        || item.name !== path.basename(item.path) || blocked.test(item.name))) throw new Error('Invalid keyboard settings');
    return { apps: data.apps };
  } catch (error) {
    if (existsSync(location())) throw new Error('키보드 관찰 설정을 읽을 수 없습니다. 설정 파일을 확인해 주세요.', { cause: error });
    return { apps: [] };
  }
}
function save(settings: KeyboardSettings) {
  const temporary = `${location()}.tmp`;
  writeFileSync(temporary, JSON.stringify(settings), { mode: 0o600 }); renameSync(temporary, location());
  return settings;
}
/** Every way of choosing a program ends here, with the same checks. */
function approve(file: string) {
  const selected = realpathSync(file), name = path.basename(selected);
  if (selected.toLowerCase() === realpathSync(process.execPath).toLowerCase()) throw new Error('Moti 내부 입력은 학습 화면에서 이미 관찰합니다. 다른 일반 앱을 선택해 주세요.');
  if (path.extname(selected).toLowerCase() !== '.exe') throw new Error('앱 실행 파일(.exe)이나 그 바로가기를 선택해 주세요.');
  if (blocked.test(name) || gameFolder.test(selected)) throw new Error('게임은 관찰 목록에 추가할 수 없습니다. 일반 앱을 선택해 주세요.');
  const settings = readKeyboardSettings();
  if (!settings.apps.some(item => item.path.toLowerCase() === selected.toLowerCase())) settings.apps.push({ path: selected, name });
  if (settings.apps.length > 32) throw new Error('승인 앱은 최대 32개입니다.');
  return save(settings);
}
/** The program a shortcut (.lnk) starts. Store-app shortcuts have no program file to approve. */
export function shortcutTarget(file: string) {
  if (path.extname(file).toLowerCase() !== '.lnk') return file;
  let target = '';
  try { target = shell.readShortcutLink(file).target; } catch { /* An unreadable shortcut is reported below. */ }
  if (!target || !path.isAbsolute(target) || path.extname(target).toLowerCase() !== '.exe' || !existsSync(target))
    throw new Error('이 바로가기는 앱 실행 파일을 가리키지 않아요. "열려 있는 앱에서 고르기"로 골라 주세요.');
  return target;
}
export async function chooseKeyboardApp(window: BrowserWindow) {
  // Installed apps leave their shortcuts here, so few people need to look for an .exe.
  const startMenu = path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const result = await dialog.showOpenDialog(window, { title: '관찰을 승인할 앱 또는 바로가기 선택', properties: ['openFile'],
    defaultPath: existsSync(startMenu) ? startMenu : undefined, filters: [{ name: '앱 또는 바로가기', extensions: ['exe', 'lnk'] }] });
  if (result.canceled) return readKeyboardSettings();
  return approve(shortcutTarget(result.filePaths[0]));
}

// Programs that own a top-level window, named by their file description (e.g. "Google Chrome").
// Window titles are not read: they can name documents or web pages.
const WINDOWED_PROCESSES = '[Console]::OutputEncoding = [Text.Encoding]::UTF8; '
  + 'Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.Path } | '
  + 'ForEach-Object { [pscustomobject]@{ path = $_.Path; title = $_.Description } } | ConvertTo-Json -Compress';
function windowedProcesses() {
  const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise<unknown>((resolve, reject) => {
    execFile(powershell, ['-NoProfile', '-NonInteractive', '-Command', WINDOWED_PROCESSES],
      { windowsHide: true, timeout: 15_000, maxBuffer: 1 << 20, encoding: 'utf8' }, (error, stdout) => {
        const failed = (cause: unknown) => reject(new Error('열려 있는 앱을 읽지 못했어요. 바로가기나 실행 파일로 직접 선택해 주세요.', { cause }));
        if (error) return failed(error);
        try { resolve(stdout.trim() ? JSON.parse(stdout) : []); } catch (cause) { failed(cause); }
      });
  });
}
/** One row per windowed program people may approve: not Windows' own shell, Moti or games. */
export function openAppsFrom(rows: unknown, own: string, systemRoot: string, approved: string[]) {
  const windows = `${systemRoot.replace(/[\\/]+$/, '')}\\`.toLowerCase();
  const seen = new Set<string>(), apps: Omit<OpenApp, 'icon'>[] = [];
  for (const row of (Array.isArray(rows) ? rows : rows ? [rows] : []) as { path?: unknown; title?: unknown }[]) {
    const file = typeof row?.path === 'string' ? row.path : '', key = file.toLowerCase();
    if (!path.win32.isAbsolute(file) || !key.endsWith('.exe') || seen.has(key)) continue;
    // Explorer, Settings and the frame of Store apps run from the Windows folder and are not typing apps.
    if (key.startsWith(windows) || key === own.toLowerCase() || blocked.test(file) || gameFolder.test(file)) continue;
    seen.add(key);
    const name = path.win32.basename(file);
    const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : name.replace(/\.exe$/i, '');
    apps.push({ name, path: file, title, approved: approved.some(item => item.toLowerCase() === key) });
  }
  return apps.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
}
const OFFER_MS = 10 * 60_000;
let offered: { paths: Set<string>; at: number } | null = null;
export async function listOpenApps(load: () => Promise<unknown> = windowedProcesses): Promise<OpenApp[]> {
  const apps = openAppsFrom(await load(), realpathSync(process.execPath), process.env.SystemRoot ?? 'C:\\Windows',
    readKeyboardSettings().apps.map(item => item.path));
  offered = { paths: new Set(apps.map(item => item.path.toLowerCase())), at: Date.now() };
  return Promise.all(apps.map(async item => ({ ...item,
    icon: await app.getFileIcon(item.path, { size: 'normal' }).then(image => image.toDataURL(), () => null) })));
}
/** Approves a program from the list this process showed last; the page cannot name any other file. */
export function approveOpenApp(file: unknown) {
  if (typeof file !== 'string' || !offered || Date.now() - offered.at > OFFER_MS || !offered.paths.has(file.toLowerCase()))
    throw new Error('열려 있는 앱 목록을 다시 불러온 뒤 골라 주세요.');
  return approve(file);
}

export function updateKeyboardSettings(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('잘못된 키보드 설정입니다.');
  const row = input as Record<string, unknown>;
  if (Object.keys(row).some(key => key !== 'removePath')) throw new Error('지원하지 않는 설정입니다.');
  const settings = readKeyboardSettings();
  if (row.removePath !== undefined) {
    if (typeof row.removePath !== 'string') throw new Error('잘못된 승인 앱입니다.');
    settings.apps = settings.apps.filter(item => item.path !== row.removePath);
  }
  return save(settings);
}
