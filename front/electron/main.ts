import { app, BrowserWindow, ipcMain, dialog, powerMonitor, Notification, shell, screen } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { trustedRecordUrl } from './recordHandlers'
import { readKeyboardSettings, chooseKeyboardApp, updateKeyboardSettings } from './keyboardSettings'
import { cameraSettingsUrl, canOpenCameraSettings } from './cameraWindow'
import { isKakaoPlaceUrl } from './externalLinks'
import { windowAppearance } from './windowAppearance'
import { createPostureTimelineStore } from './postureTimelineStore'
import { registerNotificationHandlers } from './notificationHandlers'
import { OverlayWindow } from './overlayWindow'
import { createDiagnosticLog, watchDiagnostics } from './diagnostics'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ └── main.js
// │

const distDirectory = path.join(__dirname, '../dist')
process.env.DIST = distDirectory
const publicDirectory = app.isPackaged ? distDirectory : path.join(__dirname, '../public')
process.env.VITE_PUBLIC = publicDirectory

app.setName('Moti')
const notificationAppId = app.isPackaged ? 'com.graduation.moti' : 'com.graduation.moti.development'
if (process.platform === 'win32') app.setAppUserModelId(notificationAppId)
const ownsInstance = app.requestSingleInstanceLock()
if (!ownsInstance) app.quit()
// %APPDATA%\Moti\logs — see electron/diagnostics.ts for what is (and is never) written.
const diagnostics = createDiagnosticLog(path.join(app.getPath('userData'), 'logs'))

let allowClose = false
let closingTimer: ReturnType<typeof setTimeout> | undefined
const recordsPageUrl = process.env.VITE_DEV_SERVER_URL || pathToFileURL(path.join(distDirectory, 'index.html')).href

let win: BrowserWindow | null
let cameraWindow: BrowserWindow | null = null
let windowTheme: 'light' | 'dark' = 'light'
let overlay: OverlayWindow | null = null
let notificationsEnabled = false
const inactivePowerStates = new Set<string>()
let nativeDialogs = 0
const presentation = () => ({ overlay: overlay?.isActive() ?? false, automaticAllowed: notificationsEnabled && inactivePowerStates.size === 0 && ((overlay?.isActive() ?? false)
  || (nativeDialogs === 0 && ![win, cameraWindow].some(w => w && !w.isDestroyed() && w.isFocused()))) })
const presentationChanged = () => {
  const state = presentation()
  if (!state.automaticAllowed) clearNotifications.automatic()
  if (win && !win.isDestroyed()) win.webContents.send('notifications:presentation', state)
}
let keyboardProcess: ChildProcessWithoutNullStreams | null = null
let keyboardService: { origin: string; token: string } | null = null
let keyboardStarting: Promise<{ origin: string; token: string }> | null = null
let keyboardGeneration = 0

const completeClose = async (saved: boolean) => {
  if (!win || !closingTimer) return
  clearTimeout(closingTimer); closingTimer = undefined
  if (!saved) {
    nativeDialogs++; presentationChanged()
    let result: Electron.MessageBoxReturnValue
    try { result = await dialog.showMessageBox(win, { type: 'warning', title: '기록 저장 확인',
      message: '일부 기록을 저장하지 못했습니다. 돌아가서 저장을 재시도할 수 있습니다.',
      buttons: ['돌아가기', '미저장 기록을 버리고 닫기'], defaultId: 0, cancelId: 0 }) }
    finally { nativeDialogs--; presentationChanged() }
    if (result.response !== 1) return
  }
  allowClose = true; win.close()
}
ipcMain.on('records:close-ready', (event, saved: unknown) => {
  if (win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame
    && trustedRecordUrl(event.senderFrame.url, recordsPageUrl)) {
    if (closingTimer) diagnostics.write('close-reply', { saved: saved === true })
    void completeClose(saved === true)
  }
})

const getFreeLocalPort = () => new Promise<number>((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    server.close(error => error ? reject(error) : resolve(port))
  })
})

const stopKeyboardService = () => {
  keyboardGeneration += 1
  const processToStop = keyboardProcess
  keyboardProcess = null
  keyboardService = null
  keyboardStarting = null
  if (processToStop && !processToStop.killed) processToStop.kill()
}

const waitForKeyboardService = async (origin: string, child: ChildProcessWithoutNullStreams) => {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('키보드 분석 프로세스가 준비 중 종료되었습니다.')
    try {
      const response = await fetch(`${origin}/api/status`)
      if (response.ok) return
    } catch {
      // The Python process loads its models before opening the local port.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('키보드 분석 프로세스 준비 시간이 초과되었습니다.')
}

const startKeyboardService = async (external: boolean) => {
  if (keyboardProcess && keyboardService && keyboardProcess.exitCode === null) return keyboardService
  if (keyboardStarting) return keyboardStarting

  const starting = (async () => {
    const generation = keyboardGeneration
    const settings = readKeyboardSettings()
    const observeApps = external && settings.apps.length > 0
    const port = await getFreeLocalPort()
    if (generation !== keyboardGeneration) throw new Error('키보드 분석 시작이 취소되었습니다.')
    const token = randomBytes(32).toString('base64url')
    const origin = `http://127.0.0.1:${port}`
    let command: string
    let args: string[]
    let cwd: string

    if (app.isPackaged) {
      command = path.join(process.resourcesPath, 'keyboard', 'moti-keyboard.exe')
      args = ['--host', '127.0.0.1', '--port', String(port), '--embedded']
      cwd = path.dirname(command)
      if (!existsSync(command)) {
        throw new Error('설치 파일에 키보드 분석 실행 파일이 포함되지 않았습니다.')
      }
    } else {
      const projectRoot = path.resolve(__dirname, '../..')
      cwd = path.join(projectRoot, 'keyboard-detect')
      command = path.join(cwd, '.venv', 'Scripts', 'python.exe')
      args = ['-m', 'keylog.service', '--host', '127.0.0.1', '--port', String(port), '--embedded']
      if (!existsSync(command)) {
        throw new Error('키보드 분석 Python 환경이 없습니다. 루트에서 setup.cmd를 먼저 실행해 주세요.')
      }
    }

    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, MOTI_KEYBOARD_TOKEN: token, MOTI_APPROVED_APPS: JSON.stringify(observeApps ? settings.apps.map(item => item.path) : []), PYTHONUNBUFFERED: '1' },
      windowsHide: true,
    })
    if (generation !== keyboardGeneration) {
      child.kill()
      throw new Error('키보드 분석 시작이 취소되었습니다.')
    }
    keyboardProcess = child
    let processError = ''
    // The analyzer's last messages without its per-request lines, for the diagnostics log when it stops by itself.
    let recentOutput = ''
    const spawnedAt = Date.now()
    diagnostics.write('keyboard-service-start', { packaged: app.isPackaged, approvedApps: observeApps ? settings.apps.length : 0 })
    child.stdout.resume()
    child.stderr.on('data', chunk => {
      processError = `${processError}${String(chunk)}`.slice(-2000)
      const lines = String(chunk).split(/\r?\n/).filter(line => line.trim() && !/"(GET|POST) \//.test(line))
      if (lines.length) recentOutput = `${recentOutput}\n${lines.join('\n')}`.slice(-1500)
    })
    child.once('exit', (code, signal) => {
      // stopKeyboardService clears keyboardProcess before it kills the process, so only an exit of its own keeps it set.
      const expected = keyboardProcess !== child
      diagnostics.write('keyboard-service-exit', { code, signal, expected, seconds: Math.round((Date.now() - spawnedAt) / 1000),
        ...(expected ? {} : { output: recentOutput.trim() }) })
      if (keyboardProcess === child) {
        keyboardProcess = null
        keyboardService = null
      }
    })

    try {
      await waitForKeyboardService(origin, child)
      if (generation !== keyboardGeneration) throw new Error('키보드 분석 시작이 취소되었습니다.')
    } catch (error) {
      if (!child.killed) child.kill()
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(processError.trim() ? `${message}\n${processError.trim()}` : message, { cause: error })
    }
    keyboardService = { origin, token }
    return keyboardService
  })()
  keyboardStarting = starting

  return starting.finally(() => {
    if (keyboardStarting === starting) keyboardStarting = null
  })
}

const trustedAppWindow = (event: Electron.IpcMainInvokeEvent) => {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame
    || !trustedRecordUrl(event.senderFrame.url, recordsPageUrl)) throw new Error('허용되지 않은 앱 요청입니다.')
}
const timelines = createPostureTimelineStore(path.join(app.getPath('userData'), 'posture-timelines'))
ipcMain.handle('records:posture-timeline-write', (event, batch) => { trustedAppWindow(event); return timelines.write(batch) })
ipcMain.handle('records:posture-timelines-read', (event, owner, from, to) => { trustedAppWindow(event); return timelines.read(owner, from, to) })
ipcMain.handle('records:posture-timelines-clear', (event, owner) => { trustedAppWindow(event); return timelines.clear(owner) })
const clearNotifications = registerNotificationHandlers(ipcMain, {
  trusted: trustedAppWindow,
  supported: () => process.platform === 'win32' && Notification.isSupported(),
  create: options => new Notification({ ...options, icon: path.join(publicDirectory, 'icon.png') }),
  allowed: () => presentation().automaticAllowed,
  focus: target => {
    overlay?.back()
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); if (target) win.webContents.send('desktop:navigate', target) }
  },
})
ipcMain.handle('notifications:presentation', event => { trustedAppWindow(event); return presentation() })
ipcMain.handle('notifications:configure', (event, enabled: unknown) => {
  trustedAppWindow(event)
  if (typeof enabled !== 'boolean') throw Error('잘못된 알림 설정입니다.')
  notificationsEnabled = enabled; presentationChanged()
})
let focusTimer: ReturnType<typeof setTimeout> | undefined
const refreshFocus = () => { clearTimeout(focusTimer); focusTimer = setTimeout(presentationChanged, 0) }
app.on('browser-window-focus', refreshFocus)
app.on('browser-window-blur', refreshFocus)
ipcMain.handle('keyboard-service:start', async (event, external: unknown = false) => {
  trustedAppWindow(event)
  if (typeof external !== 'boolean') throw new Error('잘못된 관찰 설정입니다.')
  try { return await startKeyboardService(external) } catch (error) { stopKeyboardService(); throw error }
})
ipcMain.handle('keyboard-service:stop', event => { trustedAppWindow(event); stopKeyboardService() })
ipcMain.handle('keyboard-settings:read', event => { trustedAppWindow(event); return readKeyboardSettings() })
ipcMain.handle('keyboard-settings:choose', async event => {
  trustedAppWindow(event); nativeDialogs++; presentationChanged()
  try { return await chooseKeyboardApp(win!) } finally { nativeDialogs--; presentationChanged() }
})
ipcMain.handle('keyboard-settings:update', (event, input: unknown) => { trustedAppWindow(event); return updateKeyboardSettings(input) })
ipcMain.handle('window:set-theme', (event, theme: unknown, dimmed: unknown) => {
  trustedAppWindow(event)
  if (typeof dimmed !== 'boolean') throw Error('잘못된 창 제목 표시줄 상태입니다.')
  const appearance = windowAppearance(theme)
  windowTheme = theme as 'light' | 'dark'
  for (const window of [win, cameraWindow]) {
    if (!window || window.isDestroyed()) continue
    window.setBackgroundColor(appearance.backgroundColor)
    window.setTitleBarOverlay(window === win && dimmed ? windowAppearance(theme, true).titleBarOverlay : appearance.titleBarOverlay)
  }
})

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    ...windowAppearance(windowTheme),
    show: false, // Don't show until ready
    icon: path.join(publicDirectory, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('will-navigate', (event, url) => { if (!trustedRecordUrl(url, recordsPageUrl)) event.preventDefault() })
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (isKakaoPlaceUrl(url)) {
      void shell.openExternal(url)
      return { action: 'deny' }
    }
    return canOpenCameraSettings(url, frameName, recordsPageUrl)
      ? { action: 'allow', overrideBrowserWindowOptions: { parent: win!, minWidth: 800, minHeight: 480,
        autoHideMenuBar: true, title: '카메라 설정 · Moti', titleBarStyle: 'hidden', ...windowAppearance(windowTheme),
        webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, preload: undefined } } }
      : { action: 'deny' }
  })
  win.webContents.on('did-create-window', child => {
    cameraWindow = child
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    child.webContents.on('will-navigate', (event, url) => { if (url !== cameraSettingsUrl(recordsPageUrl)) event.preventDefault() })
    child.on('closed', () => { if (cameraWindow === child) cameraWindow = null })
  })
  win.on('closed', () => { cameraWindow?.destroy(); cameraWindow = null })
  win.on('closed', () => overlay?.shutdown())
  win.on('restore', () => { if (overlay?.isActive()) overlay.back() })
  win.webContents.on('did-start-navigation', details => {
    // Hash-router navigation keeps the measurement owner and its Python service alive.
    if (details.isMainFrame && !details.isSameDocument) { overlay?.invalidate(); stopKeyboardService(); clearNotifications() }
  })
  win.webContents.on('render-process-gone', () => { overlay?.invalidate(); stopKeyboardService(); clearNotifications() })
  win.on('close', event => {
    if (allowClose) return
    overlay?.back()
    event.preventDefault()
    if (!closingTimer) {
      // No answer in 5 s means the screen could not save; the log tells a frozen screen from a failed upload.
      closingTimer = setTimeout(() => { diagnostics.write('close-timeout'); void completeClose(false) }, 5000)
      win?.webContents.send('records:closing')
    }
  })
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  // Show as soon as the main window is ready.
  win.once('ready-to-show', () => {
    win?.show()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(distDirectory, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopKeyboardService()
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

if (ownsInstance) app.whenReady().then(() => {
  watchDiagnostics(diagnostics, { app, screen, powerMonitor, ipc: ipcMain, mainWindow: () => win })
  const positionPath = path.join(app.getPath('userData'), 'overlay-window.json')
  overlay = new OverlayWindow(ipcMain, {
    owner: () => win, trustedOwner: trustedAppWindow, create: options => new BrowserWindow(options), screen,
    url: new URL('overlay.html', recordsPageUrl).href, preload: path.join(__dirname, 'preload.cjs'),
    beforeOpen: () => { cameraWindow?.close() }, changed: presentationChanged,
    readPosition: () => { try { const value = JSON.parse(readFileSync(positionPath, 'utf8')); return ['x', 'y', 'width', 'height'].every(k => Number.isFinite(value[k])) ? value : null } catch { return null } },
    writePosition: bounds => { try { writeFileSync(positionPath, JSON.stringify(bounds)) } catch { /* The return action remains available on read-only profiles. */ } },
  })
  // NSIS registers the installed app. Register the development executable separately
  // so Windows can identify its native notifications without an installed release.
  if (process.platform === 'win32' && !app.isPackaged) {
    try {
      const programs = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')
      mkdirSync(programs, { recursive: true })
      if (!shell.writeShortcutLink(path.join(programs, 'Moti (개발).lnk'), {
        target: process.execPath, args: `"${app.getAppPath()}"`, cwd: app.getAppPath(),
        appUserModelId: notificationAppId, icon: path.join(publicDirectory, 'icon.ico'), iconIndex: 0,
      })) console.warn('개발용 Windows 알림 바로가기를 등록하지 못했습니다.')
    } catch (error) { console.warn('개발용 Windows 알림 등록 실패', error) }
  }
  createWindow()
  const halt = (state: string) => { inactivePowerStates.add(state); clearNotifications(); cameraWindow?.close(); stopKeyboardService(); win?.webContents.send('keyboard-service:halt'); presentationChanged() }
  const resume = (state: string) => { inactivePowerStates.delete(state); presentationChanged() }
  powerMonitor.on('suspend', () => halt('suspend'))
  powerMonitor.on('lock-screen', () => halt('lock'))
  powerMonitor.on('resume', () => resume('suspend'))
  powerMonitor.on('unlock-screen', () => resume('lock'))
})
app.on('second-instance', () => { overlay?.back(); win?.restore(); win?.focus() })
app.on('before-quit', stopKeyboardService)
app.on('before-quit', () => { overlay?.shutdown(); clearNotifications() })
