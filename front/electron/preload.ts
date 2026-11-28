import { ipcRenderer, contextBridge } from 'electron'
import type { PostureTimelineBatch } from '../src/features/records/postureTimelineContract'
import type { SystemNotificationRequest } from '../src/features/notifications/contract'
import type { OverlayCommand, OverlayMode, OverlayResult, OverlaySnapshot, OverlayView } from '../src/features/overlay/contract'
import type { DesktopApi } from '../src/utils/desktopApiContract'

if (process.argv.includes('--moti-overlay')) {
  contextBridge.exposeInMainWorld('motiOverlay', {
    state: () => ipcRenderer.invoke('overlay:state'), ready: () => ipcRenderer.invoke('overlay:ready'),
    command: (command: OverlayCommand) => ipcRenderer.invoke('overlay:command', command),
    back: (mode?: OverlayMode) => ipcRenderer.invoke('overlay:back', mode),
    onState: (listener: (state: OverlayView) => void) => {
      const handle = (_event: Electron.IpcRendererEvent, value: OverlayView) => listener(value)
      ipcRenderer.on('overlay:state', handle); return () => { ipcRenderer.removeListener('overlay:state', handle) }
    },
  })
} else {
const api: DesktopApi = {
  initialize: legacy => ipcRenderer.invoke('moti-api:initialize', legacy),
  request: call => ipcRenderer.invoke('moti-api:request', call),
  cancel: id => ipcRenderer.send('moti-api:cancel', id),
  logout: revision => ipcRenderer.invoke('moti-api:logout', revision),
}
contextBridge.exposeInMainWorld('motiApi', api)

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
  setTheme: (theme: 'light' | 'dark', dimmed: boolean) => ipcRenderer.invoke('window:set-theme', theme, dimmed),
})

// Diagnostics log (electron/diagnostics.ts): memory and session state once a minute, and unhandled errors.
contextBridge.exposeInMainWorld('motiDiagnostics', {
  sample: (value: unknown) => ipcRenderer.send('diagnostics:sample', value),
  error: (value: unknown) => ipcRenderer.send('diagnostics:error', value),
})

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('motiKeyboard', {
  start: (external = false) => ipcRenderer.invoke('keyboard-service:start', external),
  stop: () => ipcRenderer.invoke('keyboard-service:stop'),
  settings: () => ipcRenderer.invoke('keyboard-settings:read'),
  chooseApp: () => ipcRenderer.invoke('keyboard-settings:choose'),
  updateSettings: (input: unknown) => ipcRenderer.invoke('keyboard-settings:update', input),
  openApps: () => ipcRenderer.invoke('keyboard-settings:open-apps'),
  approveOpenApp: (path: string) => ipcRenderer.invoke('keyboard-settings:approve-open-app', path),
  onHalt: (listener: () => void) => {
    const handle = () => listener()
    ipcRenderer.on('keyboard-service:halt', handle)
    return () => { ipcRenderer.removeListener('keyboard-service:halt', handle) }
  },
})

// Records are stored on the API server; main only asks the renderer to flush them before closing.
contextBridge.exposeInMainWorld('motiRecords', {
  writePostureTimeline: (batch: PostureTimelineBatch) => ipcRenderer.invoke('records:posture-timeline-write', batch),
  readPostureSummaries: (owner: string, from: number, to: number) => ipcRenderer.invoke('records:posture-timelines-read', owner, from, to),
  readPostureDay: (owner: string, from: number, to: number) => ipcRenderer.invoke('records:posture-timelines-day', owner, from, to),
  clearPostureTimelines: (owner: string) => ipcRenderer.invoke('records:posture-timelines-clear', owner),
  onClosing: (listener: () => Promise<boolean>) => {
    const handle = () => { void listener().then(ok => ipcRenderer.send('records:close-ready', ok)).catch(() => ipcRenderer.send('records:close-ready', false)) }
    ipcRenderer.on('records:closing', handle)
    return () => { ipcRenderer.removeListener('records:closing', handle) }
  },
})
}
