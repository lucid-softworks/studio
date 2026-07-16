import type { RasterRegion } from './raster'

export type RecoveryStoredAsset = {
  id: string
  name: string
  blob: Blob
  contentBounds?: RasterRegion | null
  precision?: Blob
  bitDepth?: 16 | 32
  precisionWidth?: number
  precisionHeight?: number
  precisionRevision?: number
}

export type RecoveryStoredProject = {
  version: number
  savedAt: string
  document: unknown
  assets: RecoveryStoredAsset[]
}

type OpfsAssetManifest = Omit<RecoveryStoredAsset, 'blob' | 'precision'> & {
  blobFile: string
  precisionFile?: string
}

type OpfsManifest = Omit<RecoveryStoredProject, 'assets'> & { assets: OpfsAssetManifest[] }
type CurrentGeneration = { generation: string; savedAt: string }

const SCRATCH_DIRECTORY = 'studio-scratch'
const CURRENT_FILE = 'current.json'
const MANIFEST_FILE = 'manifest.json'

function storageManager() {
  if (typeof navigator === 'undefined') return null
  return navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> }
}

async function scratchRoot() {
  const storage = storageManager()
  if (!storage?.getDirectory) return null
  const root = await storage.getDirectory()
  return root.getDirectoryHandle(SCRATCH_DIRECTORY, { create: true })
}

async function writeFile(directory: FileSystemDirectoryHandle, name: string, value: Blob | string) {
  const handle = await directory.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(value)
  await writable.close()
}

async function readJson<T>(directory: FileSystemDirectoryHandle, name: string): Promise<T | null> {
  try {
    const handle = await directory.getFileHandle(name)
    return JSON.parse(await (await handle.getFile()).text()) as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null
    throw error
  }
}

function generationId(savedAt: string) {
  const timestamp = savedAt.replace(/[^0-9]/g, '')
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  return `recovery-${timestamp}-${random}`
}

export async function saveOpfsRecovery(project: RecoveryStoredProject) {
  const root = await scratchRoot()
  if (!root) return false
  void storageManager()?.persist?.().catch(() => false)
  const previous = await readJson<CurrentGeneration>(root, CURRENT_FILE)
  const generation = generationId(project.savedAt)
  const directory = await root.getDirectoryHandle(generation, { create: true })
  const assets: OpfsAssetManifest[] = []

  try {
    for (const [index, asset] of project.assets.entries()) {
      const blobFile = `asset-${index}.bin`
      await writeFile(directory, blobFile, asset.blob)
      const precisionFile = asset.precision ? `precision-${index}.bin` : undefined
      if (precisionFile && asset.precision) await writeFile(directory, precisionFile, asset.precision)
      assets.push({
        id: asset.id,
        name: asset.name,
        blobFile,
        contentBounds: asset.contentBounds,
        precisionFile,
        bitDepth: asset.bitDepth,
        precisionWidth: asset.precisionWidth,
        precisionHeight: asset.precisionHeight,
        precisionRevision: asset.precisionRevision,
      })
    }
    const manifest: OpfsManifest = {
      version: project.version,
      savedAt: project.savedAt,
      document: project.document,
      assets,
    }
    await writeFile(directory, MANIFEST_FILE, JSON.stringify(manifest))
    await writeFile(root, CURRENT_FILE, JSON.stringify({ generation, savedAt: project.savedAt } satisfies CurrentGeneration))
  } catch (error) {
    await root.removeEntry(generation, { recursive: true }).catch(() => undefined)
    throw error
  }

  if (previous?.generation && previous.generation !== generation) {
    await root.removeEntry(previous.generation, { recursive: true }).catch(() => undefined)
  }
  return true
}

export async function loadOpfsRecovery(): Promise<RecoveryStoredProject | null> {
  const root = await scratchRoot()
  if (!root) return null
  const current = await readJson<CurrentGeneration>(root, CURRENT_FILE)
  if (!current?.generation) return null
  const directory = await root.getDirectoryHandle(current.generation)
  const manifest = await readJson<OpfsManifest>(directory, MANIFEST_FILE)
  if (!manifest || !Array.isArray(manifest.assets)) return null
  const assets = await Promise.all(manifest.assets.map(async (asset): Promise<RecoveryStoredAsset> => {
    const blob = await (await directory.getFileHandle(asset.blobFile)).getFile()
    const precision = asset.precisionFile
      ? await (await directory.getFileHandle(asset.precisionFile)).getFile()
      : undefined
    return {
      id: asset.id,
      name: asset.name,
      blob,
      contentBounds: asset.contentBounds,
      precision,
      bitDepth: asset.bitDepth,
      precisionWidth: asset.precisionWidth,
      precisionHeight: asset.precisionHeight,
      precisionRevision: asset.precisionRevision,
    }
  }))
  return { version: manifest.version, savedAt: manifest.savedAt, document: manifest.document, assets }
}
