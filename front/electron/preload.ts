import { ipcRenderer, contextBridge } from 'electron'
import type { RecordsApi } from '../../database/contracts'

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

contextBridge.exposeInMainWorld('motiRecords', {
  onClosing: listener => {
    const handle = () => { void listener().then(ok => ipcRenderer.send('records:close-ready', ok)).catch(() => ipcRenderer.send('records:close-ready', false)) }
    ipcRenderer.on('records:closing', handle)
    return () => { ipcRenderer.removeListener('records:closing', handle) }
  },
  generation: owner => ipcRenderer.invoke('records:generation', owner),
  write: batch => ipcRenderer.invoke('records:write', batch),
  list: query => ipcRenderer.invoke('records:list', query),
  detail: (owner, id) => ipcRenderer.invoke('records:detail', owner, id),
  statistics: query => ipcRenderer.invoke('records:statistics', query),
  writeKeyboard: batch => ipcRenderer.invoke('records:writeKeyboard', batch),
  keyboardStatistics: query => ipcRenderer.invoke('records:keyboardStatistics', query),
  keyboardDetail: (owner, id) => ipcRenderer.invoke('records:keyboardDetail', owner, id),
  clear: owner => ipcRenderer.invoke('records:clear', owner),
} satisfies RecordsApi)
