import { rasterBounds, type LayerBounds } from './renderer'
import { geometryMesh, geometryTransformIsIdentity } from './transform'
import { selectionAlphaAt } from './selection'
import type { AssetMap } from './runtime-assets'
import type { EditorDocument, Position, RasterLayer } from './types'

export type RasterTarget = {
  layer: RasterLayer
  surface: HTMLCanvasElement
  bounds: LayerBounds
  locked: boolean
}

function barycentric(point: Position, a: Position, b: Position, c: Position) {
  const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
  if (Math.abs(denominator) < 1e-10) return null
  const first = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / denominator
  const second = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / denominator
  return [first, second, 1 - first - second] as const
}

function interpolateTriangle(weights: readonly [number, number, number], a: Position, b: Position, c: Position) {
  return {
    x: weights[0] * a.x + weights[1] * b.x + weights[2] * c.x,
    y: weights[0] * a.y + weights[1] * b.y + weights[2] * c.y,
  }
}

export function geometrySourceToDestination(point: Position, transform: RasterLayer['geometryTransform']) {
  if (geometryTransformIsIdentity(transform)) return point
  const mesh = geometryMesh(transform)
  const column = Math.max(0, Math.min(mesh.columns - 2, Math.floor(point.x * (mesh.columns - 1))))
  const row = Math.max(0, Math.min(mesh.rows - 2, Math.floor(point.y * (mesh.rows - 1))))
  const topLeft = row * mesh.columns + column
  const topRight = topLeft + 1
  const bottomLeft = topLeft + mesh.columns
  const bottomRight = bottomLeft + 1
  const first = [topLeft, topRight, bottomRight] as const
  const second = [topLeft, bottomRight, bottomLeft] as const
  for (const triangle of [first, second]) {
    const weights = barycentric(point, mesh.source[triangle[0]], mesh.source[triangle[1]], mesh.source[triangle[2]])
    if (weights && weights.every((weight) => weight >= -1e-7)) return interpolateTriangle(weights, mesh.destination[triangle[0]], mesh.destination[triangle[1]], mesh.destination[triangle[2]])
  }
  return point
}

export function geometryDestinationToSource(point: Position, transform: RasterLayer['geometryTransform']) {
  if (geometryTransformIsIdentity(transform)) return point
  const mesh = geometryMesh(transform)
  let nearest = 0
  let nearestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < mesh.destination.length; index += 1) {
    const distance = (mesh.destination[index].x - point.x) ** 2 + (mesh.destination[index].y - point.y) ** 2
    if (distance < nearestDistance) { nearest = index; nearestDistance = distance }
  }
  for (let row = 0; row < mesh.rows - 1; row += 1) for (let column = 0; column < mesh.columns - 1; column += 1) {
    const topLeft = row * mesh.columns + column
    const topRight = topLeft + 1
    const bottomLeft = topLeft + mesh.columns
    const bottomRight = bottomLeft + 1
    for (const triangle of [[topLeft, topRight, bottomRight], [topLeft, bottomRight, bottomLeft]] as const) {
      const weights = barycentric(point, mesh.destination[triangle[0]], mesh.destination[triangle[1]], mesh.destination[triangle[2]])
      if (weights && weights.every((weight) => weight >= -1e-7)) return interpolateTriangle(weights, mesh.source[triangle[0]], mesh.source[triangle[1]], mesh.source[triangle[2]])
    }
  }
  return mesh.source[nearest]
}

export function resolveRasterTarget(canvas: HTMLCanvasElement, documentState: EditorDocument, assets: AssetMap, maskAssetId?: string, maskLocked?: boolean, locked?: boolean): RasterTarget | null {
  const maskSurface = maskAssetId ? assets[maskAssetId]?.surface : undefined
  const selected = documentState.layers.find((candidate) => candidate.id === documentState.selectedLayerId && candidate.type === 'raster') as RasterLayer | undefined
  const layer: RasterLayer | undefined = maskAssetId && maskSurface ? {
    id: `mask-${maskAssetId}`,
    name: 'Layer mask',
    type: 'raster',
    assetId: maskAssetId,
    visible: true,
    locked: Boolean(maskLocked),
    opacity: 100,
    position: { x: 0, y: 0 },
    rotation: 0,
    width: canvas.width,
    height: canvas.height,
    scale: 100,
  } : selected
  const surface = layer ? assets[layer.assetId]?.surface : undefined
  const bounds = layer ? rasterBounds(canvas, layer) : null
  return layer && surface && bounds ? { layer, surface, bounds, locked: Boolean(locked || layer.locked) } : null
}

export function canvasToSource(point: Position, target: RasterTarget) {
  const centerX = target.bounds.x + target.bounds.width / 2
  const centerY = target.bounds.y + target.bounds.height / 2
  const angle = -target.bounds.rotation * Math.PI / 180
  const dx = point.x - centerX
  const dy = point.y - centerY
  const localX = dx * Math.cos(angle) - dy * Math.sin(angle)
  const localY = dx * Math.sin(angle) + dy * Math.cos(angle)
  const normalized = geometryDestinationToSource({ x: localX / target.bounds.width + 0.5, y: localY / target.bounds.height + 0.5 }, target.layer.geometryTransform)
  return { x: normalized.x * target.surface.width, y: normalized.y * target.surface.height }
}

export function sourceToCanvas(point: Position, target: RasterTarget) {
  const normalized = geometrySourceToDestination({ x: point.x / target.surface.width, y: point.y / target.surface.height }, target.layer.geometryTransform)
  const localX = (normalized.x - 0.5) * target.bounds.width
  const localY = (normalized.y - 0.5) * target.bounds.height
  const angle = target.bounds.rotation * Math.PI / 180
  return {
    x: target.bounds.x + target.bounds.width / 2 + localX * Math.cos(angle) - localY * Math.sin(angle),
    y: target.bounds.y + target.bounds.height / 2 + localX * Math.sin(angle) + localY * Math.cos(angle),
  }
}

export function documentRegionToSourceRegion(region: { x: number; y: number; width: number; height: number }, bounds: LayerBounds, sourceWidth: number, sourceHeight: number) {
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const angle = -bounds.rotation * Math.PI / 180
  const sourcePoint = (point: Position) => {
    const dx = point.x - centerX
    const dy = point.y - centerY
    const localX = dx * Math.cos(angle) - dy * Math.sin(angle)
    const localY = dx * Math.sin(angle) + dy * Math.cos(angle)
    return { x: (localX / bounds.width + 0.5) * sourceWidth, y: (localY / bounds.height + 0.5) * sourceHeight }
  }
  const points = [
    sourcePoint({ x: region.x, y: region.y }),
    sourcePoint({ x: region.x + region.width, y: region.y }),
    sourcePoint({ x: region.x + region.width, y: region.y + region.height }),
    sourcePoint({ x: region.x, y: region.y + region.height }),
  ]
  const x = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))))
  const y = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))))
  const right = Math.min(sourceWidth, Math.ceil(Math.max(...points.map((point) => point.x))))
  const bottom = Math.min(sourceHeight, Math.ceil(Math.max(...points.map((point) => point.y))))
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

export function constrainRasterRegion(before: ImageData, after: ImageData, x: number, y: number, target: RasterTarget, selectionData: ImageData | null) {
  if (!selectionData) return after
  const angle = target.bounds.rotation * Math.PI / 180
  const centerX = target.bounds.x + target.bounds.width / 2
  const centerY = target.bounds.y + target.bounds.height / 2
  for (let row = 0; row < after.height; row += 1) {
    for (let column = 0; column < after.width; column += 1) {
      const sourceX = x + column
      const sourceY = y + row
      const localX = (sourceX / target.surface.width - 0.5) * target.bounds.width
      const localY = (sourceY / target.surface.height - 0.5) * target.bounds.height
      const documentX = centerX + localX * Math.cos(angle) - localY * Math.sin(angle)
      const documentY = centerY + localX * Math.sin(angle) + localY * Math.cos(angle)
      const coverage = selectionAlphaAt(selectionData, documentX, documentY)
      const offset = (row * after.width + column) * 4
      for (let channel = 0; channel < 4; channel += 1) after.data[offset + channel] = Math.round(before.data[offset + channel] * (1 - coverage) + after.data[offset + channel] * coverage)
    }
  }
  return after
}
