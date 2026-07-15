import { createRasterSurface, loadImageBlob, surfaceToBlob } from './image'
import { getCanvasPreset } from './presets'
import { flattenStackLayers, getStackChildren } from './stack'
import type { AssetMap, EditorDocument } from './types'

const PROJECT_VERSION = 1
const DATABASE_NAME = 'studio-client-projects'
const STORE_NAME = 'recovery'
const RECOVERY_KEY = 'current-document'

type StoredAsset = { id: string; name: string; blob: Blob }
type StoredProject = { version: number; savedAt: string; document: EditorDocument; assets: StoredAsset[] }
type PortableAsset = { id: string; name: string; data: string }
type PortableProject = { app: 'studio'; version: number; savedAt: string; document: EditorDocument; assets: PortableAsset[] }

export type LoadedProject = { document: EditorDocument; assets: AssetMap; savedAt?: string }

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
  return { ...normalized, layers }
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
  ])
  const entries = await Promise.all(Object.entries(assets).filter(([id]) => referencedIds.has(id)).map(async ([id, asset]) => {
    const blob = asset.surface ? await surfaceToBlob(asset.surface) : asset.blob
    return blob ? { id, name: asset.name, blob } : null
  }))
  return entries.filter((asset): asset is StoredAsset => asset !== null)
}

export async function saveRecoveryProject(document: EditorDocument, assets: AssetMap) {
  const project: StoredProject = { version: PROJECT_VERSION, savedAt: new Date().toISOString(), document, assets: await storedAssets(document, assets) }
  await transactionRequest('readwrite', (store) => store.put(project, RECOVERY_KEY))
}

export async function loadRecoveryProject(): Promise<LoadedProject | null> {
  const project = await transactionRequest<StoredProject | undefined>('readonly', (store) => store.get(RECOVERY_KEY))
  if (!project || project.version !== PROJECT_VERSION) return null
  const document = normalizeDocument(project.document)
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
  const project: PortableProject = { app: 'studio', version: PROJECT_VERSION, savedAt: new Date().toISOString(), document, assets: portableAssets }
  return JSON.stringify(project)
}

export async function parseProjectFile(file: File): Promise<LoadedProject> {
  let parsed: PortableProject
  try {
    parsed = JSON.parse(await file.text()) as PortableProject
  } catch {
    throw new Error('That is not a valid Studio project file.')
  }
  if (parsed.app !== 'studio' || parsed.version !== PROJECT_VERSION || !parsed.document || !Array.isArray(parsed.assets)) {
    throw new Error('That Studio project version is not supported.')
  }
  const stored = await Promise.all(parsed.assets.map(async (asset): Promise<StoredAsset> => {
    const response = await fetch(asset.data)
    return { id: asset.id, name: asset.name, blob: await response.blob() }
  }))
  const document = normalizeDocument(parsed.document)
  return { document, assets: await hydrateAssets(stored, document), savedAt: parsed.savedAt }
}
