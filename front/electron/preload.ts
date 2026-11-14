import { ipcRenderer, contextBridge } from 'electron'
import type { SystemNotificationRequest } from '../src/features/notifications/contract'
import type { OverlayCommand, OverlayResult, OverlaySnapshot, OverlayView } from '../src/features/overlay/contract'

if (process.argv.includes('--moti-overlay')) {
  contextBridge.exposeInMainWorld('motiOverlay', {
    state: () => ipcRenderer.invoke('overlay:state'), ready: () => ipcRenderer.invoke('overlay:ready'),
    command: (command: OverlayCommand) => ipcRenderer.invoke('overlay:command', command),
    back: () => ipcRenderer.invoke('overlay:back'),
    onState: (listener: (state: OverlayView) => void) => {
      const handle = (_event: Electron.IpcRendererEvent, value: OverlayView) => listener(value)
      ipcRenderer.on('overlay:state', handle); return () => { ipcRenderer.removeListener('overlay:state', handle) }
    },
  })
} else {
contextBridge.exposeInMainWorld('motiDesktop', {
  publish: (snapshot: OverlaySnapshot | null) => ipcRenderer.send('desktop:publish', snapshot),
  open: () => ipcRenderer.invoke('desktop:open'),
  onCommand: (listener: (command: OverlayCommand) => OverlayResult) => {
    const handle = (_event: Electron.IpcRendererEvent, command: OverlayCommand) => {
      let result: OverlayResult
      try { result = listener(command) } catch { result = { ok: false } }
      ipcRenderer.send('desktop:complete', command.id, result)
    }
    ipcRenderer.on('desktop:command', handle); return () => { ipcRenderer.removeListener('desktop:command', handle) }
  },
  onNavigate: (listener: (target: string) => void) => {
    const handle = (_event: Electron.IpcRendererEvent, target: string) => listener(target)
    ipcRenderer.on('desktop:navigate', handle); return () => { ipcRenderer.removeListener('desktop:navigate', handle) }
  },
})

contextBridge.exposeInMainWorld('motiNotifications', {
  show: (input: SystemNotificationRequest) => ipcRenderer.invoke('notifications:show', input),
  clear: (kind?: SystemNotificationRequest['kind']) => ipcRenderer.invoke('notifications:clear', kind),
  configure: (enabled: boolean) => ipcRenderer.invoke('notifications:configure', enabled),
  presentation: () => ipcRenderer.invoke('notifications:presentation'),
  onPresentation: (listener: (value: { overlay: boolean; automaticAllowed: boolean }) => void) => {
    const handle = (_event: Electron.IpcRendererEvent, value: { overlay: boolean; automaticAllowed: boolean }) => listener(value)
    ipcRenderer.on('notifications:presentation', handle); return () => { ipcRenderer.removeListener('notifications:presentation', handle) }
  },
})

contextBridge.exposeInMainWorld('motiWindow', {
  setTheme: (theme: 'light' | 'dark') => ipcRenderer.invoke('window:set-theme', theme),
})

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('motiKeyboard', {
  start: (external = false) => ipcRenderer.invoke('keyboard-service:start', external),
  stop: () => ipcRenderer.invoke('keyboard-service:stop'),
  settings: () => ipcRenderer.invoke('keyboard-settings:read'),
  chooseApp: () => ipcRenderer.invoke('keyboard-settings:choose'),
  updateSettings: (input: unknown) => ipcRenderer.invoke('keyboard-settings:update', input),
  onHalt: (listener: () => void) => {
    const handle = () => listener()
    ipcRenderer.on('keyboard-service:halt', handle)
    return () => { ipcRenderer.removeListener('keyboard-service:halt', handle) }
  },
})

// Records are stored on the API server; main only asks the renderer to flush them before closing.
contextBridge.exposeInMainWorld('motiRecords', {
  onClosing: (listener: () => Promise<boolean>) => {
    const handle = () => { void listener().then(ok => ipcRenderer.send('records:close-ready', ok)).catch(() => ipcRenderer.send('records:close-ready', false)) }
    ipcRenderer.on('records:closing', handle)
    return () => { ipcRenderer.removeListener('records:closing', handle) }
  },
})
}
