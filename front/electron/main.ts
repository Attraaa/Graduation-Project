import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

let win: BrowserWindow | null
let splash: BrowserWindow | null
let keyboardProcess: ChildProcessWithoutNullStreams | null = null
let keyboardService: { origin: string; token: string } | null = null
let keyboardStarting: Promise<{ origin: string; token: string }> | null = null
let keyboardGeneration = 0

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

const startKeyboardService = async () => {
  if (keyboardProcess && keyboardService && keyboardProcess.exitCode === null) return keyboardService
  if (keyboardStarting) return keyboardStarting

  const starting = (async () => {
    const generation = keyboardGeneration
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
      env: { ...process.env, MOTI_KEYBOARD_TOKEN: token, PYTHONUNBUFFERED: '1' },
      windowsHide: true,
    })
    if (generation !== keyboardGeneration) {
      child.kill()
      throw new Error('키보드 분석 시작이 취소되었습니다.')
    }
    keyboardProcess = child
    let processError = ''
    child.stdout.resume()
    child.stderr.on('data', chunk => { processError = `${processError}${String(chunk)}`.slice(-2000) })
    child.once('exit', () => {
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

ipcMain.handle('keyboard-service:start', startKeyboardService)
ipcMain.handle('keyboard-service:stop', () => stopKeyboardService())

function createWindow() {
  // Create Splash Screen
  splash = new BrowserWindow({
    width: 350,
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    icon: path.join(publicDirectory, 'icon.png')
  })
  splash.loadFile(path.join(publicDirectory, 'splash.html'))

  win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    show: false, // Don't show until ready
    icon: path.join(publicDirectory, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  // Show when ready and after animation
  win.once('ready-to-show', () => {
    setTimeout(() => {
      if (splash) {
        splash.close()
        splash = null
      }
      win?.show()
    }, 2800) // Wait 2.8s for the CSS progress bar to complete
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

app.whenReady().then(createWindow)
app.on('before-quit', stopKeyboardService)
