import { Fragment, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { type RasterEdit, type RasterRegion } from '../editor/raster'
import { captureRasterTiles, createRasterTileSnapshot, rasterSnapshotRegion, type RasterTileSnapshot } from '../editor/raster-tiles'
import { canvasToSource, constrainRasterRegion, resolveRasterTarget, sourceToCanvas, type RasterTarget } from '../editor/raster-target'
import type { SelectionState } from '../editor/selection'
import type { AssetMap } from '../editor/runtime-assets'
import type { EditorDocument, Position } from '../editor/types'
import { renderComposition } from '../editor/renderer'
import { geometryMesh, geometryTransformIsIdentity } from '../editor/transform'
import { useRasterStrokePreview } from './useRasterStrokePreview'

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  document: EditorDocument
  assets: AssetMap
  tool: 'clone-stamp' | 'healing'
  size: number
  strength: number
  aligned: boolean
  sampleMode: 'current' | 'current-and-below'
  sourceRotation: number
  sourceScale: number
  selection: SelectionState | null
  locked?: boolean
  onChange: (assetId: string, region?: RasterRegion) => void
  onCommit: (edit: RasterEdit) => void
}

type Source = { assetId: string; point: Position }
type Stroke = {
  pointerId: number
  target: RasterTarget
  before: RasterTileSnapshot
  mergedDocument: EditorDocument | null
  mergedTiles: Map<string, { canvas: HTMLCanvasElement; x: number; y: number }>
  sampleCanvas: HTMLCanvasElement
  last: Position
  offset: Position
  radius: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  selectionData: ImageData | null
  previewing: boolean
}

function tileSample(stroke: Stroke, centerX: number, centerY: number) {
  const diameter = Math.max(1, Math.ceil(stroke.radius * 2))
  const left = Math.floor(centerX - stroke.radius)
  const top = Math.floor(centerY - stroke.radius)
  const x = Math.max(0, left)
  const y = Math.max(0, top)
  const width = Math.max(0, Math.min(stroke.target.surface.width, left + diameter) - x)
  const height = Math.max(0, Math.min(stroke.target.surface.height, top + diameter) - y)
  const sample = stroke.sampleCanvas
  if (sample.width !== diameter) sample.width = diameter
  if (sample.height !== diameter) sample.height = diameter
  const context = sample.getContext('2d')
  context?.clearRect(0, 0, diameter, diameter)
  if (context && width > 0 && height > 0) {
    captureRasterTiles(stroke.before, x, y, width, height)
    context.putImageData(rasterSnapshotRegion(stroke.before, x, y, width, height), x - left, y - top)
  }
  return sample
}

export function CloneStampOverlay({ canvasRef, document, assets, tool, size, strength, aligned, sampleMode, sourceRotation, sourceScale, selection, locked, onChange, onCommit }: Props) {
  const strokeRef = useRef<Stroke | null>(null)
  const alignedOffsetRef = useRef<Position | null>(null)
  const [source, setSource] = useState<Source | null>(null)
  const canvas = canvasRef.current
  const target = canvas ? resolveRasterTarget(canvas, document, assets, undefined, undefined, locked) : null
  const strokePreview = useRasterStrokePreview({ canvasRef, document, assets, layer: target?.layer, surface: target?.surface })

  const canvasPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / rect.width * (canvas?.width ?? 1600), y: (event.clientY - rect.top) / rect.height * (canvas?.height ?? 1000) }
  }

  const mergedTile = (stroke: Stroke, tileX: number, tileY: number) => {
    const key = `${tileX}:${tileY}`
    const cached = stroke.mergedTiles.get(key)
    if (cached) return cached
    const x = tileX * 256
    const y = tileY * 256
    const width = Math.min(256, stroke.target.surface.width - x)
    const height = Math.min(256, stroke.target.surface.height - y)
    const samplePoints = [
      sourceToCanvas({ x, y }, stroke.target),
      sourceToCanvas({ x: x + width, y }, stroke.target),
      sourceToCanvas({ x: x + width, y: y + height }, stroke.target),
      sourceToCanvas({ x, y: y + height }, stroke.target),
      ...geometryMesh(stroke.target.layer.geometryTransform).source.flatMap((sourcePoint) => {
        const point = { x: sourcePoint.x * stroke.target.surface.width, y: sourcePoint.y * stroke.target.surface.height }
        return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height ? [sourceToCanvas(point, stroke.target)] : []
      }),
    ]
    const left = Math.floor(Math.min(...samplePoints.map((point) => point.x))) - 2
    const top = Math.floor(Math.min(...samplePoints.map((point) => point.y))) - 2
    const right = Math.ceil(Math.max(...samplePoints.map((point) => point.x))) + 2
    const bottom = Math.ceil(Math.max(...samplePoints.map((point) => point.y))) + 2
    const viewport = { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
    const rendered = window.document.createElement('canvas')
    renderComposition(rendered, stroke.mergedDocument!, assets, { viewport })
    const output = window.document.createElement('canvas')
    output.width = width
    output.height = height
    const context = output.getContext('2d')
    const renderedContext = rendered.getContext('2d', { willReadFrequently: true })
    if (context && renderedContext) {
      const source = renderedContext.getImageData(0, 0, rendered.width, rendered.height)
      const result = context.createImageData(width, height)
      const sample = (sampleX: number, sampleY: number, channel: number) => {
        const left = Math.max(0, Math.min(source.width - 1, Math.floor(sampleX)))
        const top = Math.max(0, Math.min(source.height - 1, Math.floor(sampleY)))
        const right = Math.min(source.width - 1, left + 1)
        const bottom = Math.min(source.height - 1, top + 1)
        const fractionX = Math.max(0, Math.min(1, sampleX - left))
        const fractionY = Math.max(0, Math.min(1, sampleY - top))
        const at = (column: number, row: number) => source.data[(row * source.width + column) * 4 + channel]
        return Math.round((at(left, top) * (1 - fractionX) + at(right, top) * fractionX) * (1 - fractionY) + (at(left, bottom) * (1 - fractionX) + at(right, bottom) * fractionX) * fractionY)
      }
      for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
        const documentPoint = sourceToCanvas({ x: x + column + 0.5, y: y + row + 0.5 }, stroke.target)
        const sampleX = documentPoint.x - viewport.x - 0.5
        const sampleY = documentPoint.y - viewport.y - 0.5
        if (sampleX < 0 || sampleY < 0 || sampleX >= source.width || sampleY >= source.height) continue
        const offset = (row * width + column) * 4
        for (let channel = 0; channel < 4; channel += 1) result.data[offset + channel] = sample(sampleX, sampleY, channel)
      }
      context.putImageData(result, 0, 0)
    }
    const tile = { canvas: output, x, y }
    stroke.mergedTiles.set(key, tile)
    return tile
  }

  const mergedSample = (stroke: Stroke, centerX: number, centerY: number) => {
    const diameter = Math.max(1, Math.ceil(stroke.radius * 2))
    const left = Math.floor(centerX - stroke.radius)
    const top = Math.floor(centerY - stroke.radius)
    const sample = stroke.sampleCanvas
    if (sample.width !== diameter) sample.width = diameter
    if (sample.height !== diameter) sample.height = diameter
    const context = sample.getContext('2d')
    context?.clearRect(0, 0, diameter, diameter)
    if (!context) return sample
    const startTileX = Math.max(0, Math.floor(left / 256))
    const startTileY = Math.max(0, Math.floor(top / 256))
    const endTileX = Math.min(Math.ceil(stroke.target.surface.width / 256) - 1, Math.floor((left + diameter - 1) / 256))
    const endTileY = Math.min(Math.ceil(stroke.target.surface.height / 256) - 1, Math.floor((top + diameter - 1) / 256))
    for (let tileY = startTileY; tileY <= endTileY; tileY += 1) for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
      const tile = mergedTile(stroke, tileX, tileY)
      context.drawImage(tile.canvas, tile.x - left, tile.y - top)
    }
    return sample
  }

  const stamp = (stroke: Stroke, destination: Position) => {
    const context = stroke.target.surface.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const previous = stroke.last
    const distance = Math.hypot(destination.x - previous.x, destination.y - previous.y)
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, stroke.radius * 0.3)))
    for (let step = 1; step <= steps; step += 1) {
      const amount = step / steps
      const x = previous.x + (destination.x - previous.x) * amount
      const y = previous.y + (destination.y - previous.y) * amount
      const sourceX = x + stroke.offset.x
      const sourceY = y + stroke.offset.y
      const sourceImage = stroke.mergedDocument ? mergedSample(stroke, sourceX, sourceY) : tileSample(stroke, sourceX, sourceY)
      captureRasterTiles(stroke.before, x - stroke.radius - 2, y - stroke.radius - 2, stroke.radius * 2 + 4, stroke.radius * 2 + 4)
      context.save()
      context.beginPath()
      context.arc(x, y, stroke.radius, 0, Math.PI * 2)
      context.clip()
      context.globalAlpha = tool === 'healing' ? Math.min(0.72, strength / 100) : strength / 100
      context.globalCompositeOperation = tool === 'healing' ? 'luminosity' : 'source-over'
      context.translate(x, y)
      context.rotate(sourceRotation * Math.PI / 180)
      context.scale(sourceScale / 100, sourceScale / 100)
      context.drawImage(sourceImage, 0, 0, sourceImage.width, sourceImage.height, -stroke.radius, -stroke.radius, stroke.radius * 2, stroke.radius * 2)
      context.restore()
      stroke.minX = Math.min(stroke.minX, x - stroke.radius)
      stroke.minY = Math.min(stroke.minY, y - stroke.radius)
      stroke.maxX = Math.max(stroke.maxX, x + stroke.radius)
      stroke.maxY = Math.max(stroke.maxY, y + stroke.radius)
    }
    stroke.last = destination
    if (stroke.previewing) strokePreview.schedulePreview()
    else onChange(stroke.target.layer.assetId, {
      x: Math.min(previous.x, destination.x) - stroke.radius - 2,
      y: Math.min(previous.y, destination.y) - stroke.radius - 2,
      width: Math.abs(destination.x - previous.x) + stroke.radius * 2 + 4,
      height: Math.abs(destination.y - previous.y) + stroke.radius * 2 + 4,
    })
  }

  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!target || target.locked) return
    const point = canvasToSource(canvasPoint(event), target)
    if (event.altKey || !source || source.assetId !== target.layer.assetId) {
      setSource({ assetId: target.layer.assetId, point })
      alignedOffsetRef.current = null
      return
    }
    const context = target.surface.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const before = createRasterTileSnapshot(target.surface)
    let mergedDocument: EditorDocument | null = null
    if (sampleMode === 'current-and-below' && canvas) {
      const selectedIndex = document.layers.findIndex((layer) => layer.id === target.layer.id)
      mergedDocument = { ...document, layers: selectedIndex < 0 ? document.layers : document.layers.slice(0, selectedIndex + 1), selectedLayerId: null, selectedLayerIds: [], selectedGroupId: null }
    }
    const radius = Math.max(0.5, size / (target.bounds.width / target.surface.width) / 2)
    const selectionContext = selection?.bounds ? selection.mask.getContext('2d', { willReadFrequently: true }) : null
    const selectionData = selectionContext && selection ? selectionContext.getImageData(0, 0, selection.mask.width, selection.mask.height) : null
    const strokeOffset = aligned && alignedOffsetRef.current ? alignedOffsetRef.current : { x: source.point.x - point.x, y: source.point.y - point.y }
    if (aligned) alignedOffsetRef.current = strokeOffset
    const stroke: Stroke = {
      pointerId: event.pointerId,
      target,
      before,
      mergedDocument,
      mergedTiles: new Map(),
      sampleCanvas: window.document.createElement('canvas'),
      last: point,
      offset: strokeOffset,
      radius,
      minX: point.x - radius,
      minY: point.y - radius,
      maxX: point.x + radius,
      maxY: point.y + radius,
      selectionData,
      previewing: !selectionData && geometryTransformIsIdentity(target.layer.geometryTransform) && !target.layer.maskAssetId && !target.layer.vectorMask && !target.layer.clipToBelow,
    }
    strokeRef.current = stroke
    if (stroke.previewing) strokePreview.beginPreview()
    stamp(stroke, point)
    if (stroke.previewing) strokePreview.drawPreview()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Synthetic browser events do not expose capture. */ }
  }

  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const stroke = strokeRef.current
    if (!stroke || stroke.pointerId !== event.pointerId) return
    stamp(stroke, canvasToSource(canvasPoint(event), stroke.target))
  }

  const pointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    const stroke = strokeRef.current
    if (!stroke || stroke.pointerId !== event.pointerId) return
    strokeRef.current = null
    strokePreview.cancelScheduledPreview()
    const context = stroke.target.surface.getContext('2d', { willReadFrequently: true })
    if (!context) {
      if (stroke.previewing) strokePreview.cancelPreview()
      return
    }
    const x = Math.max(0, Math.floor(stroke.minX - 2))
    const y = Math.max(0, Math.floor(stroke.minY - 2))
    const width = Math.min(stroke.target.surface.width - x, Math.ceil(stroke.maxX + 2) - x)
    const height = Math.min(stroke.target.surface.height - y, Math.ceil(stroke.maxY + 2) - y)
    if (width <= 0 || height <= 0) {
      if (stroke.previewing) strokePreview.cancelPreview()
      return
    }
    const before = rasterSnapshotRegion(stroke.before, x, y, width, height)
    const after = constrainRasterRegion(before, context.getImageData(x, y, width, height), x, y, stroke.target, stroke.selectionData)
    context.putImageData(after, x, y)
    onChange(stroke.target.layer.assetId, { x, y, width, height })
    onCommit({ assetId: stroke.target.layer.assetId, x, y, before, after })
    if (stroke.previewing) {
      strokePreview.drawPreview()
      strokePreview.finishPreview()
    }
  }

  const marker = source && target && source.assetId === target.layer.assetId ? sourceToCanvas(source.point, target) : null

  return (
    <Fragment>
      <canvas ref={strokePreview.previewCanvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 hidden size-full" />
      <svg
        aria-label={`${tool === 'healing' ? 'Healing brush' : 'Clone stamp'} surface`}
        viewBox={`0 0 ${canvas?.width ?? 1600} ${canvas?.height ?? 1000}`}
        preserveAspectRatio="none"
        className={`absolute inset-0 size-full touch-none ${target && !target.locked ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
      >
        {marker && <g className="pointer-events-none"><circle cx={marker.x} cy={marker.y} r={Math.max(10, (canvas?.width ?? 1600) / 90)} fill="none" stroke="#ffffff" strokeWidth="2" vectorEffect="non-scaling-stroke" /><line x1={marker.x - 12} y1={marker.y} x2={marker.x + 12} y2={marker.y} stroke="#18181b" strokeWidth="3" vectorEffect="non-scaling-stroke" /><line x1={marker.x} y1={marker.y - 12} x2={marker.x} y2={marker.y + 12} stroke="#18181b" strokeWidth="3" vectorEffect="non-scaling-stroke" /></g>}
      </svg>
    </Fragment>
  )
}
