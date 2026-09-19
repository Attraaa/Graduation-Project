import { ipcRenderer, contextBridge } from 'electron'
import type { RecordsApi } from '../../database/contracts'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other apts you need here.
  // ...
})

contextBridge.exposeInMainWorld('motiKeyboard', {
  start: () => ipcRenderer.invoke('keyboard-service:start'),
  stop: () => ipcRenderer.invoke('keyboard-service:stop'),
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
  clear: owner => ipcRenderer.invoke('records:clear', owner),
} satisfies RecordsApi)
