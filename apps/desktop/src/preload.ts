import { contextBridge, ipcRenderer } from 'electron'

const subscribe = <T>(channel: string, listener: (value: T) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, value: T) => listener(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('studioDesktop', {
  openFile: () => ipcRenderer.invoke('studio:open-dialog'),
  saveBlob: (filename: string, type: string, data: ArrayBuffer) => ipcRenderer.invoke('studio:save-dialog', { filename, type, data }),
  writeClipboardImage: (dataUrl: string) => ipcRenderer.invoke('studio:clipboard-image', dataUrl),
  pickColor: () => ipcRenderer.invoke('studio:pick-color'),
  writeScratch: (key: string, data: ArrayBuffer) => ipcRenderer.invoke('studio:scratch-write', key, data),
  clearScratch: () => ipcRenderer.invoke('studio:scratch-clear'),
  setScratchLimit: (bytes: number) => ipcRenderer.invoke('studio:scratch-limit', bytes),
  onOpenFile: (listener: (file: unknown) => void) => subscribe('studio:open-file', listener),
  onCommand: (listener: (command: string) => void) => subscribe('studio:command', listener),
  onExternalChange: (listener: (change: unknown) => void) => subscribe('studio:external-change', listener),
})
