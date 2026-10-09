import { ipcRenderer, contextBridge } from 'electron'

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
