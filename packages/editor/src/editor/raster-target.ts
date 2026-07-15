import { getLayerBounds, type LayerBounds } from './renderer'
import { selectionAlphaAt } from './selection'
import type { AssetMap } from './runtime-assets'
import type { EditorDocument, Position, RasterLayer } from './types'

export type RasterTarget = {
  layer: RasterLayer
  surface: HTMLCanvasElement
  bounds: LayerBounds
  locked: boolean
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
  const context = canvas.getContext('2d')
  const bounds = layer && context ? getLayerBounds(context, canvas, layer, assets) : null
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
  return {
    x: (localX / target.bounds.width + 0.5) * target.surface.width,
    y: (localY / target.bounds.height + 0.5) * target.surface.height,
  }
}

export function sourceToCanvas(point: Position, target: RasterTarget) {
  const localX = (point.x / target.surface.width - 0.5) * target.bounds.width
  const localY = (point.y / target.surface.height - 0.5) * target.bounds.height
  const angle = target.bounds.rotation * Math.PI / 180
  return {
    x: target.bounds.x + target.bounds.width / 2 + localX * Math.cos(angle) - localY * Math.sin(angle),
    y: target.bounds.y + target.bounds.height / 2 + localX * Math.sin(angle) + localY * Math.cos(angle),
  }
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
