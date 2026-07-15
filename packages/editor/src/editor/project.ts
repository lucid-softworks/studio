import { createRasterSurface, loadImageBlob, surfaceToBlob } from './image'
import { getCanvasPreset, initialDocument } from './presets'
import type { AssetMap } from './runtime-assets'
import { flattenStackLayers, getStackChildren } from './stack'
import { EDITOR_DOCUMENT_SCHEMA_VERSION, type EditorDocument } from './types'

export const STUDIO_PROJECT_VERSION = 2 as const
const DATABASE_NAME = 'studio-client-projects'
const STORE_NAME = 'recovery'
const RECOVERY_KEY = 'current-document'

type StoredAsset = { id: string; name: string; blob: Blob }
type StoredProject = { version: number; savedAt: string; document: unknown; assets: StoredAsset[] }
type PortableAsset = { id: string; name: string; data: string }
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
])

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
    return normalizedLayer.groupId && !groupIds.has(normalizedLayer.groupId) ? { ...normalizedLayer, groupId: null } : normalizedLayer
  })
  const selectedGroupId = value.selectedGroupId && groupIds.has(value.selectedGroupId) ? value.selectedGroupId : null
  let normalized = { ...value, canvasSize, groups, layers, selectedLayerId, selectedLayerIds, selectedGroupId }
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
    ...document.layers.filter((layer) => layer.type === 'raster').map((layer) => layer.assetId),
    ...document.layers.flatMap((layer) => layer.maskAssetId ? [layer.maskAssetId] : []),
    ...(document.channels ?? []).flatMap((channel) => channel.assetId ? [channel.assetId] : []),
  ])
  const entries = await Promise.all(assets.map(async (asset) => {
    const source = await loadImageBlob(asset.blob, asset.name)
    return [asset.id, rasterAssetIds.has(asset.id) ? createRasterSurface(source) : source] as const
  }))
  return Object.fromEntries(entries)
}

async function storedAssets(document: EditorDocument, assets: AssetMap): Promise<StoredAsset[]> {
  const referencedIds = new Set([
    ...document.layers.flatMap((layer) => [
      ...('assetId' in layer ? [layer.assetId] : []),
      ...(layer.maskAssetId ? [layer.maskAssetId] : []),
    ]),
    ...(document.background.imageAssetId ? [document.background.imageAssetId] : []),
    ...(document.channels ?? []).flatMap((channel) => channel.assetId ? [channel.assetId] : []),
  ])
  const entries = await Promise.all(Object.entries(assets).filter(([id]) => referencedIds.has(id)).map(async ([id, asset]) => {
    const blob = asset.surface ? await surfaceToBlob(asset.surface) : asset.blob
    return blob ? { id, name: asset.name, blob } : null
  }))
  return entries.filter((asset): asset is StoredAsset => asset !== null)
}

export async function saveRecoveryProject(document: EditorDocument, assets: AssetMap) {
  const project: StoredProject = { version: STUDIO_PROJECT_VERSION, savedAt: new Date().toISOString(), document, assets: await storedAssets(document, assets) }
  await transactionRequest('readwrite', (store) => store.put(project, RECOVERY_KEY))
}

export async function loadRecoveryProject(): Promise<LoadedProject | null> {
  const project = await transactionRequest<StoredProject | undefined>('readonly', (store) => store.get(RECOVERY_KEY))
  if (!project || project.version < 1 || project.version > STUDIO_PROJECT_VERSION || !Array.isArray(project.assets)) return null
  const document = migrateDocument(project.document, project.version)
  return { document, assets: await hydrateAssets(project.assets, document), savedAt: project.savedAt }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('An image asset could not be encoded.'))
    reader.readAsDataURL(blob)
  })
}

export async function serializeProject(document: EditorDocument, assets: AssetMap) {
  const portableAssets = await Promise.all((await storedAssets(document, assets)).map(async (asset): Promise<PortableAsset> => ({ id: asset.id, name: asset.name, data: await blobToDataUrl(asset.blob) })))
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
  const portableAssets = parsed.assets.every((asset) => isRecord(asset) && typeof asset.id === 'string' && typeof asset.name === 'string' && typeof asset.data === 'string')
    ? parsed.assets as PortableAsset[]
    : null
  if (!portableAssets) throw new Error('The Studio project contains invalid asset data.')
  const stored = await Promise.all(portableAssets.map(async (asset): Promise<StoredAsset> => {
    const response = await fetch(asset.data)
    return { id: asset.id, name: asset.name, blob: await response.blob() }
  }))
  const document = migrateDocument(parsed.document, parsed.version)
  return { document, assets: await hydrateAssets(stored, document), savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : undefined }
}
