import { createRasterSurface, loadImageBlob, surfaceToBlob } from './image'
import { normalizeLayerFilters } from './filters'
import { getCanvasPreset, initialDocument } from './presets'
import type { AssetMap } from './runtime-assets'
import type { RasterRegion } from './raster'
import { loadOpfsRecovery, saveOpfsRecovery, type RecoveryStoredAsset, type RecoveryStoredProject } from './opfs-recovery'
import type { BrowserWritable } from './file-save'
import { flattenStackLayers, getStackChildren } from './stack'
import { EDITOR_DOCUMENT_SCHEMA_VERSION, type EditorDocument } from './types'

export const STUDIO_PROJECT_VERSION = 3 as const
const DATABASE_NAME = 'studio-client-projects'
const STORE_NAME = 'recovery'
const RECOVERY_KEY = 'current-document'
export const OPFS_RECOVERY_THRESHOLD_BYTES = 128 * 1024 * 1024

type StoredAsset = RecoveryStoredAsset
type StoredProject = RecoveryStoredProject
type PortableAsset = { id: string; name: string; data: string; contentBounds?: RasterRegion | null; precision?: string; bitDepth?: 16 | 32; precisionWidth?: number; precisionHeight?: number; precisionRevision?: number }
type PortableProject = { app: 'studio'; version: number; savedAt: string; document: unknown; assets: PortableAsset[] }

export type LoadedProject = { document: EditorDocument; assets: AssetMap; savedAt?: string }

type UnknownRecord = Record<string, unknown>
type DocumentMigration = (document: UnknownRecord) => UnknownRecord

const documentMigrations = new Map<number, DocumentMigration>([
  [1, (document) => ({
    ...document,
    schemaVersion: 2,
    canvasSize: document.canvasSize ?? initialDocument.canvasSize,
    groups: document.groups ?? [],
    selectedLayerIds: document.selectedLayerIds ?? (typeof document.selectedLayerId === 'string' ? [document.selectedLayerId] : []),
    selectedGroupId: document.selectedGroupId ?? null,
  })],
  [2, (document) => ({
    ...document,
    schemaVersion: 3,
    bitDepth: 8,
  })],
])

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRasterRegion(value: unknown): value is RasterRegion {
  return isRecord(value)
    && typeof value.x === 'number' && Number.isFinite(value.x)
    && typeof value.y === 'number' && Number.isFinite(value.y)
    && typeof value.width === 'number' && Number.isFinite(value.width) && value.width >= 0
    && typeof value.height === 'number' && Number.isFinite(value.height) && value.height >= 0
}

function documentVersion(value: UnknownRecord, projectVersion: number) {
  if (typeof value.schemaVersion === 'number' && Number.isInteger(value.schemaVersion)) return value.schemaVersion
  return projectVersion === 1 ? 1 : null
}

function assertDocumentShape(value: UnknownRecord): asserts value is UnknownRecord & EditorDocument {
  if (
    value.schemaVersion !== EDITOR_DOCUMENT_SCHEMA_VERSION
    || typeof value.canvasPreset !== 'string'
    || !isRecord(value.background)
    || !isRecord(value.pattern)
    || !Array.isArray(value.layers)
    || !Array.isArray(value.groups)
  ) {
    throw new Error('The Studio document data is incomplete or damaged.')
  }
}

export function migrateDocument(value: unknown, projectVersion: number): EditorDocument {
  if (!isRecord(value)) throw new Error('The Studio document data is incomplete or damaged.')
  let migrated = value
  let version = documentVersion(migrated, projectVersion)
  if (version === null || version < 1 || version > EDITOR_DOCUMENT_SCHEMA_VERSION) {
    throw new Error('That Studio document schema version is not supported.')
  }

  while (version < EDITOR_DOCUMENT_SCHEMA_VERSION) {
    const migrate = documentMigrations.get(version)
    if (!migrate) throw new Error(`Studio cannot migrate document schema version ${version}.`)
    migrated = migrate(migrated)
    version += 1
  }

  assertDocumentShape(migrated)
  return normalizeDocument(migrated)
}

function normalizeDocument(value: EditorDocument): EditorDocument {
  const bitDepth: EditorDocument['bitDepth'] = value.bitDepth === 16 || value.bitDepth === 32 ? value.bitDepth : 8
  const selectedLayerId = value.selectedLayerId && value.layers.some((layer) => layer.id === value.selectedLayerId) ? value.selectedLayerId : null
  const selectedLayerIds = Array.isArray(value.selectedLayerIds)
    ? value.selectedLayerIds.filter((id) => value.layers.some((layer) => layer.id === id))
    : selectedLayerId ? [selectedLayerId] : []
  const fallback = getCanvasPreset(value.canvasPreset)
  const canvasSize = value.canvasSize ?? { width: fallback.width, height: fallback.height }
  const rawGroups = Array.isArray(value.groups) ? value.groups : []
  const rawGroupIds = new Set(rawGroups.map((group) => group.id))
  const rawParents = new Map(rawGroups.map((group) => [group.id, group.parentId ?? null]))
  const groups = rawGroups.map((group) => ({
    ...group,
    parentId: (() => {
      if (!group.parentId || !rawGroupIds.has(group.parentId) || group.parentId === group.id) return null
      const seen = new Set([group.id])
      let current: string | null = group.parentId
      while (current) {
        if (seen.has(current)) return null
        seen.add(current)
        current = rawParents.get(current) ?? null
      }
      return group.parentId
    })(),
  }))
  const groupIds = new Set(groups.map((group) => group.id))
  let layers = value.layers.map((layer) => {
    const normalizedLayer = layer.type === 'text' && !layer.fontFamily ? { ...layer, fontFamily: 'Inter' } : layer
    const withContent = normalizedLayer.type === 'smart-object' && normalizedLayer.embeddedDocument
      ? { ...normalizedLayer, embeddedDocument: normalizeDocument(normalizedLayer.embeddedDocument) }
      : normalizedLayer
    const withSmartFilters = withContent.type === 'smart-object'
      ? { ...withContent, smartFilters: (withContent.smartFilters ?? []).map((filter) => ({ ...filter, settings: normalizeLayerFilters(filter.settings) })) }
      : withContent
    return withSmartFilters.groupId && !groupIds.has(withSmartFilters.groupId) ? { ...withSmartFilters, groupId: null } : withSmartFilters
  })
  const selectedGroupId = value.selectedGroupId && groupIds.has(value.selectedGroupId) ? value.selectedGroupId : null
  const paths = Array.isArray(value.paths) ? value.paths : []
  const selectedPathId = value.selectedPathId && paths.some((path) => path.id === value.selectedPathId) ? value.selectedPathId : null
  const grid = {
    visible: value.grid?.visible === true,
    spacing: Math.max(4, Math.min(2000, Number(value.grid?.spacing) || 100)),
    subdivisions: Math.max(1, Math.min(10, Math.round(Number(value.grid?.subdivisions) || 4))),
    color: typeof value.grid?.color === 'string' ? value.grid.color : '#38bdf8',
    snap: value.grid?.snap !== false,
  }
  const artboards = Array.isArray(value.artboards) ? value.artboards.flatMap((artboard) => {
    if (!artboard || typeof artboard !== 'object' || typeof artboard.id !== 'string') return []
    return [{ ...artboard, name: typeof artboard.name === 'string' ? artboard.name : 'Artboard', x: Number(artboard.x) || 0, y: Number(artboard.y) || 0, width: Math.max(1, Number(artboard.width) || canvasSize.width), height: Math.max(1, Number(artboard.height) || canvasSize.height), background: { kind: artboard.background?.kind === 'color' ? 'color' as const : 'transparent' as const, color: typeof artboard.background?.color === 'string' ? artboard.background.color : '#ffffff' } }]
  }) : []
  const colorMode: NonNullable<EditorDocument['colorMode']> = value.colorMode === 'grayscale' || value.colorMode === 'indexed' || value.colorMode === 'cmyk' ? value.colorMode : 'rgb'
  const colorSettings = { intent: value.colorSettings?.intent === 'perceptual' || value.colorSettings?.intent === 'absolute' ? value.colorSettings.intent : 'relative' as const, blackPointCompensation: value.colorSettings?.blackPointCompensation !== false, proofEnabled: value.colorSettings?.proofEnabled === true, gamutWarning: value.colorSettings?.gamutWarning === true, ...value.colorSettings }
  let normalized = { ...value, bitDepth, canvasSize, groups, layers, selectedLayerId, selectedLayerIds, selectedGroupId, paths, selectedPathId, guides: Array.isArray(value.guides) ? value.guides : [], grid, artboards, colorMode, indexedColors: Math.max(2, Math.min(256, value.indexedColors ?? 256)), colorSettings }
  for (const parentId of [null, ...groups.map((group) => group.id)]) {
    const orders = new Map(getStackChildren(normalized, parentId).map((item, index) => [`${item.type}:${item.id}`, index]))
    normalized = {
      ...normalized,
      groups: normalized.groups.map((group) => orders.has(`group:${group.id}`) ? { ...group, stackOrder: orders.get(`group:${group.id}`) } : group),
      layers: normalized.layers.map((layer) => orders.has(`layer:${layer.id}`) ? { ...layer, stackOrder: orders.get(`layer:${layer.id}`) } : layer),
    }
  }
  layers = flattenStackLayers(normalized)
  return { ...normalized, schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION, layers }
}

function documentTree(document: EditorDocument): EditorDocument[] {
  return [document, ...document.layers.flatMap((layer) => layer.type === 'smart-object' && layer.embeddedDocument ? documentTree(layer.embeddedDocument) : [])]
}

function referencedAssetIds(document: EditorDocument) {
  const documents = documentTree(document)
  return new Set([
    ...documents.flatMap((nested) => nested.layers.flatMap((layer) => [
      ...('assetId' in layer ? [layer.assetId] : []),
      ...(layer.maskAssetId ? [layer.maskAssetId] : []),
    ])),
    ...documents.flatMap((nested) => nested.background.imageAssetId ? [nested.background.imageAssetId] : []),
    ...documents.flatMap((nested) => (nested.channels ?? []).flatMap((channel) => channel.assetId ? [channel.assetId] : [])),
  ])
}

export function estimateProjectAssetBytes(document: EditorDocument, assets: AssetMap) {
  const referencedIds = referencedAssetIds(document)
  return Object.entries(assets).reduce((total, [id, asset]) => {
    if (!referencedIds.has(id)) return total
    const pixels = asset.surface ? asset.surface.width * asset.surface.height * 4 : 0
    return total + Math.max(asset.blob?.size ?? 0, pixels) + (asset.precision?.data.byteLength ?? 0)
  }, 0)
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Local project storage could not be opened.'))
  })
}

function transactionRequest<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const request = operation(transaction.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Local project storage failed.'))
    transaction.oncomplete = () => database.close()
  }))
}

async function hydrateAssets(assets: StoredAsset[], document: EditorDocument): Promise<AssetMap> {
  const rasterAssetIds = new Set([
    ...documentTree(document).flatMap((nested) => nested.layers.filter((layer) => layer.type === 'raster' || layer.type === 'smart-object').map((layer) => layer.assetId)),
    ...documentTree(document).flatMap((nested) => nested.layers.flatMap((layer) => layer.maskAssetId ? [layer.maskAssetId] : [])),
    ...documentTree(document).flatMap((nested) => (nested.channels ?? []).flatMap((channel) => channel.assetId ? [channel.assetId] : [])),
  ])
  const entries = await Promise.all(assets.map(async (asset) => {
    const source = await loadImageBlob(asset.blob, asset.name)
    const hydrated = rasterAssetIds.has(asset.id) ? createRasterSurface(source) : source
    if (asset.contentBounds === null) hydrated.contentBounds = null
    else if (isRasterRegion(asset.contentBounds)) hydrated.contentBounds = { ...asset.contentBounds }
    if (asset.precision && (asset.bitDepth === 16 || asset.bitDepth === 32) && asset.precisionWidth && asset.precisionHeight) {
      const buffer = await asset.precision.arrayBuffer()
      hydrated.precision = {
        bitDepth: asset.bitDepth,
        width: asset.precisionWidth,
        height: asset.precisionHeight,
        data: asset.bitDepth === 16 ? new Uint16Array(buffer) : new Float32Array(buffer),
        revision: asset.precisionRevision ?? 0,
      }
    }
    return [asset.id, hydrated] as const
  }))
  return Object.fromEntries(entries)
}

async function* storedAssetEntries(document: EditorDocument, assets: AssetMap): AsyncGenerator<StoredAsset> {
  const referencedIds = referencedAssetIds(document)
  for (const [id, asset] of Object.entries(assets)) {
    if (!referencedIds.has(id)) continue
    const blob = asset.surface ? await surfaceToBlob(asset.surface) : asset.blob
    const precision = asset.precision
    const precisionBytes = precision ? new Uint8Array(precision.data.byteLength) : undefined
    if (precisionBytes && precision) precisionBytes.set(new Uint8Array(precision.data.buffer, precision.data.byteOffset, precision.data.byteLength))
    const precisionBlob = precisionBytes ? new Blob([precisionBytes]) : undefined
    if (blob) yield {
      id,
      name: asset.name,
      blob,
      contentBounds: asset.contentBounds ? { ...asset.contentBounds } : asset.contentBounds,
      precision: precisionBlob,
      bitDepth: precision?.bitDepth,
      precisionWidth: precision?.width,
      precisionHeight: precision?.height,
      precisionRevision: precision?.revision,
    }
  }
}

async function storedAssets(document: EditorDocument, assets: AssetMap): Promise<StoredAsset[]> {
  const entries: StoredAsset[] = []
  for await (const asset of storedAssetEntries(document, assets)) entries.push(asset)
  return entries
}

export async function saveRecoveryProject(document: EditorDocument, assets: AssetMap) {
  const project: StoredProject = { version: STUDIO_PROJECT_VERSION, savedAt: new Date().toISOString(), document, assets: await storedAssets(document, assets) }
  if (estimateProjectAssetBytes(document, assets) >= OPFS_RECOVERY_THRESHOLD_BYTES && await saveOpfsRecovery(project)) return
  await transactionRequest('readwrite', (store) => store.put(project, RECOVERY_KEY))
}

export async function loadRecoveryProject(): Promise<LoadedProject | null> {
  const candidates = await Promise.allSettled([
    transactionRequest<StoredProject | undefined>('readonly', (store) => store.get(RECOVERY_KEY)),
    loadOpfsRecovery(),
  ])
  const project = candidates.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : [])
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt))[0]
  if (!project || project.version < 1 || project.version > STUDIO_PROJECT_VERSION || !Array.isArray(project.assets)) return null
  const document = migrateDocument(project.document, project.version)
  return { document, assets: await hydrateAssets(project.assets, document), savedAt: project.savedAt }
}

async function blobToDataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32_768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`
}

async function writeBase64(writable: BrowserWritable, blob: Blob) {
  const reader = blob.stream().getReader()
  let remainder = new Uint8Array()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      const bytes = new Uint8Array(remainder.length + chunk.value.length)
      bytes.set(remainder)
      bytes.set(chunk.value, remainder.length)
      const completeLength = bytes.length - bytes.length % 3
      for (let offset = 0; offset < completeLength; offset += 24_576) {
        const end = Math.min(completeLength, offset + 24_576)
        await writable.write(btoa(String.fromCharCode(...bytes.subarray(offset, end))))
      }
      remainder = bytes.slice(completeLength)
    }
    if (remainder.length) await writable.write(btoa(String.fromCharCode(...remainder)))
  } finally {
    reader.releaseLock()
  }
}

async function writePortableBlob(writable: BrowserWritable, blob: Blob) {
  await writable.write(`data:${blob.type || 'application/octet-stream'};base64,`)
  await writeBase64(writable, blob)
}

export async function writeProjectStream(writable: BrowserWritable, document: EditorDocument, assets: AssetMap) {
  const savedAt = new Date().toISOString()
  try {
    await writable.write(`{"app":"studio","version":${STUDIO_PROJECT_VERSION},"savedAt":${JSON.stringify(savedAt)},"document":${JSON.stringify(document)},"assets":[`)
    let index = 0
    for await (const asset of storedAssetEntries(document, assets)) {
      if (index > 0) await writable.write(',')
      const { blob, precision, ...metadata } = asset
      await writable.write(`${JSON.stringify(metadata).slice(0, -1)},"data":"`)
      await writePortableBlob(writable, blob)
      if (precision) {
        await writable.write('","precision":"')
        await writePortableBlob(writable, precision)
      }
      await writable.write('"}')
      index += 1
    }
    await writable.write(']}')
    await writable.close()
  } catch (error) {
    await writable.abort?.(error).catch(() => undefined)
    throw error
  }
}

export async function serializeProject(document: EditorDocument, assets: AssetMap) {
  const portableAssets = await Promise.all((await storedAssets(document, assets)).map(async (asset): Promise<PortableAsset> => ({
    id: asset.id,
    name: asset.name,
    data: await blobToDataUrl(asset.blob),
    contentBounds: asset.contentBounds ? { ...asset.contentBounds } : asset.contentBounds,
    precision: asset.precision ? await blobToDataUrl(asset.precision) : undefined,
    bitDepth: asset.bitDepth,
    precisionWidth: asset.precisionWidth,
    precisionHeight: asset.precisionHeight,
    precisionRevision: asset.precisionRevision,
  })))
  const project: PortableProject = { app: 'studio', version: STUDIO_PROJECT_VERSION, savedAt: new Date().toISOString(), document, assets: portableAssets }
  return JSON.stringify(project)
}

export async function parseProjectFile(file: File): Promise<LoadedProject> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text()) as unknown
  } catch {
    throw new Error('That is not a valid Studio project file.')
  }
  if (!isRecord(parsed) || parsed.app !== 'studio' || typeof parsed.version !== 'number' || !Number.isInteger(parsed.version)) {
    throw new Error('That is not a valid Studio project file.')
  }
  if (parsed.version < 1 || parsed.version > STUDIO_PROJECT_VERSION || !Array.isArray(parsed.assets)) {
    throw new Error('That Studio project version is not supported.')
  }
  const portableAssets = parsed.assets.every((asset) => isRecord(asset)
    && typeof asset.id === 'string' && typeof asset.name === 'string' && typeof asset.data === 'string'
    && (!('contentBounds' in asset) || asset.contentBounds === null || isRasterRegion(asset.contentBounds)))
    ? parsed.assets as PortableAsset[]
    : null
  if (!portableAssets) throw new Error('The Studio project contains invalid asset data.')
  const stored = await Promise.all(portableAssets.map(async (asset): Promise<StoredAsset> => {
    const response = await fetch(asset.data)
    const precisionResponse = asset.precision ? await fetch(asset.precision) : undefined
    return {
      id: asset.id,
      name: asset.name,
      blob: await response.blob(),
      contentBounds: asset.contentBounds ? { ...asset.contentBounds } : asset.contentBounds,
      precision: precisionResponse ? await precisionResponse.blob() : undefined,
      bitDepth: asset.bitDepth,
      precisionWidth: asset.precisionWidth,
      precisionHeight: asset.precisionHeight,
      precisionRevision: asset.precisionRevision,
    }
  }))
  const document = migrateDocument(parsed.document, parsed.version)
  return { document, assets: await hydrateAssets(stored, document), savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : undefined }
}
