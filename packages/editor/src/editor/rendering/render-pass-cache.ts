import type { AssetMap, SourceImage } from '../runtime-assets'
import { getDescendantGroupIds } from '../stack'
import type { EditorDocument, EditorLayer } from '../types'

const assetIdentities = new WeakMap<SourceImage, number>()
let nextAssetIdentity = 1

function assetSignature(asset: SourceImage | undefined) {
  if (!asset) return 'missing'
  let identity = assetIdentities.get(asset)
  if (!identity) {
    identity = nextAssetIdentity
    nextAssetIdentity += 1
    assetIdentities.set(asset, identity)
  }
  return `${identity}:${asset.revision ?? 0}:${asset.surface?.width ?? asset.element.naturalWidth}:${asset.surface?.height ?? asset.element.naturalHeight}`
}

export function backgroundPassSignature(document: EditorDocument, assets: AssetMap) {
  const imageAsset = document.background.imageAssetId
    ? assets[document.background.imageAssetId]
    : undefined
  return JSON.stringify([
    document.canvasSize,
    document.background,
    document.pattern,
    assetSignature(imageAsset),
  ])
}

export function layerPassSignature(layer: EditorLayer, assets: AssetMap): string | null {
  if (layer.type === 'text') return null
  const asset = layer.type === 'image' || layer.type === 'raster' ? assets[layer.assetId] : undefined
  return JSON.stringify([layer, assetSignature(asset)])
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

export class RenderPassCache {
  readonly #signatures: Array<string | null> = []

  shouldRender(index: number, signature: string | null, invalidated = false) {
    const changed = invalidated || signature === null || this.#signatures[index] !== signature
    this.#signatures[index] = signature
    return changed
  }

  truncate(length: number) {
    this.#signatures.length = length
  }

  clear() {
    this.#signatures.length = 0
  }
}
