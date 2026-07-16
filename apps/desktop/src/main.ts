import { app, BrowserWindow, Menu, clipboard, desktopCapturer, dialog, ipcMain, nativeImage, screen, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, rm, stat } from 'node:fs/promises'
import { watch, type FSWatcher } from 'node:fs'
import { atomicWrite, mimeForPath, nextRecent, safeScratchKey } from './files.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const recentLimit = 12
let mainWindow: BrowserWindow | null = null
let currentFilePath: string | null = null
let fileWatcher: FSWatcher | null = null
let ignoreExternalChangesUntil = 0

type NativeFile = { name: string; type: string; data: ArrayBuffer; path?: string; lastModified?: number }

const settingsPath = () => join(app.getPath('userData'), 'desktop-settings.json')
const scratchDirectory = () => join(app.getPath('userData'), 'scratch')

async function readSettings() {
  try { return JSON.parse(await readFile(settingsPath(), 'utf8')) as { recent?: string[]; scratchLimit?: number } } catch { return {} }
}

async function writeSettings(patch: { recent?: string[]; scratchLimit?: number }) {
  const settings = { ...await readSettings(), ...patch }
  await atomicWrite(settingsPath(), new TextEncoder().encode(JSON.stringify(settings, null, 2)))
}

async function addRecent(path: string) {
  const settings = await readSettings()
  await writeSettings({ recent: nextRecent(settings.recent ?? [], path, recentLimit) })
  await rebuildMenu()
}

async function watchCurrentFile(path: string) {
  fileWatcher?.close()
  currentFilePath = path
  try {
    fileWatcher = watch(path)
    fileWatcher.on('change', () => {
      if (Date.now() < ignoreExternalChangesUntil) return
      mainWindow?.webContents.send('studio:external-change', { path, at: new Date().toISOString() })
    })
    fileWatcher.on('error', () => { fileWatcher?.close(); fileWatcher = null })
  } catch { fileWatcher = null }
}

async function readNativeFile(path: string): Promise<NativeFile> {
  const [buffer, details] = await Promise.all([readFile(path), stat(path)])
  await addRecent(path)
  await watchCurrentFile(path)
  return { name: path.split(/[\\/]/).at(-1) ?? 'document', type: mimeForPath(path), data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), path, lastModified: details.mtimeMs }
}

async function openPath(path: string) {
  try {
    const file = await readNativeFile(path)
    if (mainWindow?.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', () => mainWindow?.webContents.send('studio:open-file', file))
    else mainWindow?.webContents.send('studio:open-file', file)
    mainWindow?.show()
  } catch (error) { void dialog.showMessageBox({ type: 'error', title: 'Could not open file', message: error instanceof Error ? error.message : 'Studio could not read that file.' }) }
}

function sendCommand(command: string) { mainWindow?.webContents.send('studio:command', command) }

async function rebuildMenu() {
  const recent = (await readSettings()).recent ?? []
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: 'Studio', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'File', submenu: [
      { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => sendCommand('new') },
      { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('open') },
      { label: 'Open Recent', submenu: recent.length ? recent.map((path) => ({ label: path.split(/[\\/]/).at(-1) ?? path, sublabel: path, click: () => void openPath(path) })) : [{ label: 'No Recent Files', enabled: false }] },
      { type: 'separator' },
      { label: 'Save Studio Project…', accelerator: 'CmdOrCtrl+S', click: () => sendCommand('save') },
      { type: 'separator' }, { role: 'close' },
    ] },
    { label: 'Edit', submenu: [{ label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => sendCommand('undo') }, { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => sendCommand('redo') }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' }, { type: 'separator' }, { label: 'Copy merged image', click: () => sendCommand('copy-merged') }, { label: 'Pick screen colour', accelerator: 'CmdOrCtrl+Shift+I', click: () => sendCommand('pick-color') }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440, height: 960, minWidth: 960, minHeight: 640, backgroundColor: '#0b0b0c', title: 'Studio', show: false,
    webPreferences: { preload: join(currentDirectory, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  mainWindow = window
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => { if (mainWindow === window) mainWindow = null })
  window.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: 'deny' } })
  const developmentUrl = process.env.STUDIO_WEB_URL
  window.webContents.on('will-navigate', (event, url) => {
    const allowed = developmentUrl ? url.startsWith(developmentUrl) : url.startsWith('file:')
    if (!allowed) { event.preventDefault(); void shell.openExternal(url) }
  })
  if (developmentUrl) void window.loadURL(developmentUrl)
  else void window.loadFile(join(currentDirectory, '../../web/dist/index.html'), { hash: '/app' })
}

ipcMain.handle('studio:open-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile'], filters: [{ name: 'Studio documents and images', extensions: ['studio', 'psd', 'psb', 'png', 'jpg', 'jpeg', 'webp', 'avif', 'svg', 'tif', 'tiff', 'exr', 'hdr', 'heic', 'heif', 'ico', 'pdf', 'dng', 'cr2', 'nef', 'arw', 'orf', 'rw2'] }, { name: 'All files', extensions: ['*'] }] })
  return result.canceled || !result.filePaths[0] ? null : readNativeFile(result.filePaths[0])
})

ipcMain.handle('studio:save-dialog', async (_event, request: { filename: string; data: ArrayBuffer }) => {
  const result = await dialog.showSaveDialog(mainWindow!, { defaultPath: currentFilePath && request.filename.endsWith('.studio') ? currentFilePath : request.filename })
  if (result.canceled || !result.filePath) return { canceled: true }
  ignoreExternalChangesUntil = Date.now() + 1500
  await atomicWrite(result.filePath, new Uint8Array(request.data))
  if (request.filename.endsWith('.studio')) { await addRecent(result.filePath); await watchCurrentFile(result.filePath) }
  return { canceled: false, path: result.filePath }
})

ipcMain.handle('studio:clipboard-image', (_event, dataUrl: string) => { clipboard.writeImage(nativeImage.createFromDataURL(dataUrl)); return true })
ipcMain.handle('studio:pick-color', async () => {
  const point = screen.getCursorScreenPoint(); const display = screen.getDisplayNearestPoint(point); const scale = display.scaleFactor
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) } })
  const source = sources.find((candidate) => candidate.display_id === String(display.id)) ?? sources[0]
  if (!source || source.thumbnail.isEmpty()) return null
  const x = Math.max(0, Math.min(source.thumbnail.getSize().width - 1, Math.round((point.x - display.bounds.x) * scale)))
  const y = Math.max(0, Math.min(source.thumbnail.getSize().height - 1, Math.round((point.y - display.bounds.y) * scale)))
  const pixel = source.thumbnail.crop({ x, y, width: 1, height: 1 }).toBitmap()
  return `#${[pixel[2], pixel[1], pixel[0]].map((value) => value.toString(16).padStart(2, '0')).join('')}`
})

ipcMain.handle('studio:scratch-write', async (_event, key: string, data: ArrayBuffer) => {
  const settings = await readSettings(); const limit = settings.scratchLimit ?? 2 * 1024 ** 3
  if (data.byteLength > limit) throw new Error('This document exceeds the configured scratch-disk limit.')
  const path = join(scratchDirectory(), `${safeScratchKey(key)}.studio-cache`)
  await atomicWrite(path, new Uint8Array(data)); return { path, bytes: data.byteLength }
})
ipcMain.handle('studio:scratch-clear', async () => { await rm(scratchDirectory(), { recursive: true, force: true }); return true })
ipcMain.handle('studio:scratch-limit', async (_event, bytes: number) => { await writeSettings({ scratchLimit: Math.max(256 * 1024 ** 2, Math.min(64 * 1024 ** 3, bytes)) }); return true })

app.on('open-file', (event, path) => { event.preventDefault(); if (app.isReady()) void openPath(path); else app.once('ready', () => void openPath(path)) })
const lock = app.requestSingleInstanceLock()
if (!lock) app.quit()
else app.on('second-instance', (_event, argv) => { const path = argv.find((value) => !value.startsWith('-') && extname(value)); if (path) void openPath(path); else mainWindow?.show() })

app.whenReady().then(async () => {
  createWindow(); await rebuildMenu()
  const startupPath = process.argv.slice(1).find((value) => !value.startsWith('-') && extname(value)); if (startupPath) void openPath(startupPath)
  if (app.isPackaged) void autoUpdater.checkForUpdatesAndNotify().catch(() => { /* Offline startup must not block the editor. */ })
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => fileWatcher?.close())
