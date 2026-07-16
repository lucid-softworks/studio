import type { AssetMap, SourceImage } from '../runtime-assets'
import type { RasterRegion } from '../raster'
import { getDescendantGroupIds } from '../stack'
import type { EditorDocument, EditorLayer } from '../types'
import { DEFAULT_RENDER_TILE_SIZE, regionsToTiles } from './render-tiles'

const assetIdentities = new WeakMap<object, number>()
let nextAssetIdentity = 1

function assetSignature(asset: SourceImage | undefined, includeRevision = true) {
  if (!asset) return 'missing'
  const resource = asset.surface ?? asset.element
  let identity = assetIdentities.get(resource)
  if (!identity) {
    identity = nextAssetIdentity
    nextAssetIdentity += 1
    assetIdentities.set(resource, identity)
  }
  const revision = includeRevision ? `:${asset.revision ?? 0}` : ''
  return `${identity}${revision}:${asset.surface?.width ?? asset.element.naturalWidth}:${asset.surface?.height ?? asset.element.naturalHeight}`
}

export function backgroundPassSignature(document: EditorDocument, assets: AssetMap) {
  const imageAsset = document.background.imageAssetId
    ? assets[document.background.imageAssetId]
    : undefined
  return JSON.stringify([
    document.canvasSize,
    document.background,
    document.pattern,
    document.artboards,
    assetSignature(imageAsset),
  ])
}

export function layerPassSignature(layer: EditorLayer, assets: AssetMap): string | null {
  if (layer.type === 'text') return null
  const asset = layer.type === 'image' || layer.type === 'raster' || layer.type === 'smart-object' ? assets[layer.assetId] : undefined
  const filterMasks = layer.type === 'smart-object' ? layer.smartFilters.map((filter) => assetSignature(filter.maskAssetId ? assets[filter.maskAssetId] : undefined)) : []
  return JSON.stringify([layer, assetSignature(asset), filterMasks])
}

export function layerPassStructureSignature(layer: EditorLayer, assets: AssetMap): string | null {
  if (layer.type === 'text') return null
  const asset = layer.type === 'image' || layer.type === 'raster' || layer.type === 'smart-object' ? assets[layer.assetId] : undefined
  const filterMasks = layer.type === 'smart-object' ? layer.smartFilters.map((filter) => assetSignature(filter.maskAssetId ? assets[filter.maskAssetId] : undefined, false)) : []
  return JSON.stringify([layer, assetSignature(asset, false), filterMasks])
}

export function maskedLayerPassSignature(layer: EditorLayer, assets: AssetMap): string | null {
  const layerSignature = layerPassSignature(layer, assets)
  if (!layerSignature) return null
  return JSON.stringify([
    layerSignature,
    layer.maskAssetId,
    assetSignature(layer.maskAssetId ? assets[layer.maskAssetId] : undefined),
  ])
}

export function groupPassSignature(document: EditorDocument, groupId: string, assets: AssetMap): string | null {
  const groupIds = getDescendantGroupIds(document, groupId)
  groupIds.add(groupId)
  const groups = document.groups.filter((group) => groupIds.has(group.id))
  const layers = document.layers.filter((layer) => layer.groupId && groupIds.has(layer.groupId))
  const layerSignatures = layers.map((layer) => maskedLayerPassSignature(layer, assets))
  if (layerSignatures.some((signature) => signature === null)) return null
  return JSON.stringify([groups, layerSignatures])
}

type PassEntry = {
  signature: string | null
  structureSignature: string | null
  revision: number
}

export type RenderPassInvalidation = { shouldRender: boolean; regions: RasterRegion[] }

export class RenderPassCache {
  readonly #entries: Array<PassEntry | undefined> = []
  readonly #tiles = new Map<string, { passIndex: number; structureSignature: string | null; lastUsed: number }>()
  readonly maxCachedTiles: number
  #clock = 0

  constructor(maxCachedTiles = 8192) {
    this.maxCachedTiles = maxCachedTiles
  }

  get cachedTileCount() {
    return this.#tiles.size
  }

  shouldRender(index: number, signature: string | null, invalidated = false) {
    const changed = invalidated || signature === null || this.#entries[index]?.signature !== signature
    this.#entries[index] = { signature, structureSignature: signature, revision: 0 }
    return changed
  }

  prepare(
    index: number,
    signature: string | null,
    width: number,
    height: number,
    options: {
      invalidated?: boolean
      structureSignature?: string | null
      revision?: number
      dirtyRegions?: ReadonlyArray<{ revision: number; region: RasterRegion }>
    } = {},
  ): RenderPassInvalidation {
    const previous = this.#entries[index]
    const structureSignature = options.structureSignature ?? signature
    const revision = options.revision ?? 0
    this.#entries[index] = { signature, structureSignature, revision }
    let regions: RasterRegion[] = []
    if (!options.invalidated && signature !== null && previous?.signature === signature) {
      regions = []
    } else {
      const canPartiallyInvalidate = !options.invalidated
        && signature !== null
        && structureSignature !== null
        && previous?.structureSignature === structureSignature
        && revision > previous.revision
      if (canPartiallyInvalidate) {
        const dirtyEntries = options.dirtyRegions
          ?.filter((entry) => entry.revision > previous.revision && entry.revision <= revision)
          .sort((left, right) => left.revision - right.revision) ?? []
        const hasCompleteHistory = dirtyEntries.length === revision - previous.revision
          && dirtyEntries[0]?.revision === previous.revision + 1
          && dirtyEntries.at(-1)?.revision === revision
        if (hasCompleteHistory) regions = regionsToTiles(dirtyEntries.map((entry) => entry.region), width, height)
      }
      if (regions.length === 0) regions = [{ x: 0, y: 0, width, height }]
    }

    const clock = ++this.#clock
    const missing: RasterRegion[] = []
    for (const tile of regionsToTiles([{ x: 0, y: 0, width, height }], width, height)) {
      const tileX = Math.floor(tile.x / DEFAULT_RENDER_TILE_SIZE)
      const tileY = Math.floor(tile.y / DEFAULT_RENDER_TILE_SIZE)
      const key = `${index}:${tileX}:${tileY}`
      const cached = this.#tiles.get(key)
      if (!cached || cached.structureSignature !== structureSignature) missing.push(tile)
      this.#tiles.set(key, { passIndex: index, structureSignature, lastUsed: clock })
    }
    regions = regionsToTiles([...regions, ...missing], width, height)
    while (this.#tiles.size > this.maxCachedTiles) {
      const oldest = [...this.#tiles.entries()].sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0]
      if (!oldest) break
      this.#tiles.delete(oldest[0])
    }

    return { shouldRender: regions.length > 0, regions }
  }

  truncate(length: number) {
    this.#entries.length = length
    for (const [key, tile] of this.#tiles) if (tile.passIndex >= length) this.#tiles.delete(key)
  }

  clear() {
    this.#entries.length = 0
    this.#tiles.clear()
  }
}
