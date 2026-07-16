import { dirname, extname } from 'node:path'
import { mkdir, open, rename, rm } from 'node:fs/promises'

export const mimeForPath = (path: string) => ({ '.studio': 'application/x-studio+json', '.psd': 'image/vnd.adobe.photoshop', '.psb': 'image/vnd.adobe.photoshop', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.pdf': 'application/pdf' })[extname(path).toLocaleLowerCase()] ?? 'application/octet-stream'

export function nextRecent(current: string[], path: string, limit = 12) {
  return [path, ...current.filter((candidate) => candidate !== path)].slice(0, Math.max(1, limit))
}

export function safeScratchKey(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, '_').slice(0, 120) || 'document'
}

export async function atomicWrite(path: string, data: Uint8Array) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  const handle = await open(temporary, 'wx')
  try { await handle.writeFile(data); await handle.sync() } finally { await handle.close() }
  try { await rename(temporary, path) } catch (error) { await rm(temporary, { force: true }); throw error }
}
