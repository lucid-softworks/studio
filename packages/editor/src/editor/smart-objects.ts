import type { AffineTransform, Position, SmartObjectLayer } from './types'
import type { EditorDocument } from './types'
import type { AssetMap } from './runtime-assets'

export type Quad = [Position, Position, Position, Position]

export function affineTransformFromQuad(points: number[], width: number, height: number): AffineTransform | undefined {
  if (points.length < 8 || width <= 0 || height <= 0 || points.slice(0, 8).some((value) => !Number.isFinite(value))) return undefined
  const [left, top, right, rightTop, _rightBottom, _bottom, leftBottom, bottomLeft] = points
  return [(right - left) / width, (rightTop - top) / width, (leftBottom - left) / height, (bottomLeft - top) / height, left, top]
}

export function transformPoint(matrix: AffineTransform, point: Position): Position {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  }
}

export function smartObjectSourceQuad(layer: Pick<SmartObjectLayer, 'width' | 'height' | 'transformMatrix'>): Quad | undefined {
  if (!layer.transformMatrix) return undefined
  return [
    transformPoint(layer.transformMatrix, { x: 0, y: 0 }),
    transformPoint(layer.transformMatrix, { x: layer.width, y: 0 }),
    transformPoint(layer.transformMatrix, { x: layer.width, y: layer.height }),
    transformPoint(layer.transformMatrix, { x: 0, y: layer.height }),
  ]
}

export function smartObjectDisplayQuad(layer: SmartObjectLayer, canvasWidth: number, canvasHeight: number): Quad | undefined {
  const source = smartObjectSourceQuad(layer)
  if (!source) return undefined
  const center = {
    x: source.reduce((total, point) => total + point.x, 0) / source.length,
    y: source.reduce((total, point) => total + point.y, 0) / source.length,
  }
  const angle = layer.rotation * Math.PI / 180
  const scale = layer.scale / 100
  return source.map((point) => {
    const x = (point.x - center.x) * scale * (layer.flipX ? -1 : 1)
    const y = (point.y - center.y) * scale * (layer.flipY ? -1 : 1)
    return {
      x: center.x + x * Math.cos(angle) - y * Math.sin(angle) + layer.position.x * canvasWidth,
      y: center.y + x * Math.sin(angle) + y * Math.cos(angle) + layer.position.y * canvasHeight,
    }
  }) as Quad
}

export function quadBounds(quad: Quad) {
  const x = Math.min(...quad.map((point) => point.x))
  const y = Math.min(...quad.map((point) => point.y))
  const right = Math.max(...quad.map((point) => point.x))
  const bottom = Math.max(...quad.map((point) => point.y))
  return { x, y, width: right - x, height: bottom - y }
}

export function smartObjectBytesHash(bytes: Uint8Array) {
  let hash = 0x811c9dc5
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${bytes.length.toString(16)}`
}

export function smartObjectDocumentHash(document: EditorDocument, assets: AssetMap) {
  const assetIds = new Set(document.layers.flatMap((layer) => [
    ...('assetId' in layer ? [layer.assetId] : []),
    ...(layer.maskAssetId ? [layer.maskAssetId] : []),
    ...(layer.type === 'smart-object' ? layer.smartFilters.flatMap((filter) => filter.maskAssetId ? [filter.maskAssetId] : []) : []),
  ]))
  const assetState = [...assetIds].sort().map((id) => {
    const asset = assets[id]
    return [id, asset?.name, asset?.revision ?? 0, asset?.surface?.width ?? asset?.element.naturalWidth ?? 0, asset?.surface?.height ?? asset?.element.naturalHeight ?? 0]
  })
  return smartObjectBytesHash(new TextEncoder().encode(JSON.stringify([document, assetState])))
}
