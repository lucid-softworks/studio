import { Fragment, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { type RasterEdit, type RasterRegion } from '../editor/raster'
import { captureRasterTiles, createRasterTileSnapshot, rasterSnapshotRegion, type RasterTileSnapshot } from '../editor/raster-tiles'
import { canvasToSource, constrainRasterRegion, resolveRasterTarget, type RasterTarget } from '../editor/raster-target'
import { applyRetouchStamp, sampleAverageColor, type RetouchMode, type ToneRange } from '../editor/retouch'
import { geometryTransformIsIdentity } from '../editor/transform'
import type { SelectionState } from '../editor/selection'
import type { AssetMap } from '../editor/runtime-assets'
import type { EditorDocument, Position } from '../editor/types'
import { useRasterStrokePreview } from './useRasterStrokePreview'

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  document: EditorDocument
  assets: AssetMap
  tool: RetouchMode
  size: number
  strength: number
  flow: number
  color: string
  toneRange: ToneRange
  protectTones: boolean
  spongeMode: 'saturate' | 'desaturate'
  vibrance: boolean
  selection: SelectionState | null
  locked?: boolean
  onChange: (assetId: string, region?: RasterRegion) => void
  onCommit: (edit: RasterEdit) => void
}

type Stroke = {
  pointerId: number
  target: RasterTarget
  before: RasterTileSnapshot
  history: RasterTileSnapshot
  last: Position
  radius: number
  targetColor: [number, number, number]
  mixerColor: [number, number, number]
  minX: number
  minY: number
  maxX: number
  maxY: number
  selectionData: ImageData | null
  previewing: boolean
}

export function PixelRetouchOverlay({ canvasRef, document, assets, tool, size, strength, flow, color, toneRange, protectTones, spongeMode, vibrance, selection, locked, onChange, onCommit }: Props) {
  const strokeRef = useRef<Stroke | null>(null)
  const historyRef = useRef<{ assetId: string; snapshot: RasterTileSnapshot } | null>(null)
  const canvas = canvasRef.current
  const target = canvas ? resolveRasterTarget(canvas, document, assets, undefined, undefined, locked) : null
  const strokePreview = useRasterStrokePreview({ canvasRef, document, assets, layer: target?.layer, surface: target?.surface })

  const canvasPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / rect.width * (canvas?.width ?? 1600), y: (event.clientY - rect.top) / rect.height * (canvas?.height ?? 1000) }
  }

  const paint = (stroke: Stroke, point: Position) => {
    const previous = stroke.last
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y)
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, stroke.radius * 0.3)))
    const context = stroke.target.surface.getContext('2d', { willReadFrequently: true })
    if (!context) return
    for (let step = 1; step <= steps; step += 1) {
      const amount = step / steps
      const x = previous.x + (point.x - previous.x) * amount
      const y = previous.y + (point.y - previous.y) * amount
      const padding = Math.max(2, Math.ceil(stroke.radius * 0.35))
      const left = Math.max(0, Math.floor(x - stroke.radius - padding))
      const top = Math.max(0, Math.floor(y - stroke.radius - padding))
      const width = Math.min(stroke.target.surface.width - left, Math.ceil(stroke.radius * 2 + padding * 2))
      const height = Math.min(stroke.target.surface.height - top, Math.ceil(stroke.radius * 2 + padding * 2))
      if (width <= 0 || height <= 0) continue
      captureRasterTiles(stroke.before, left, top, width, height)
      captureRasterTiles(stroke.history, left, top, width, height)
      const after = context.getImageData(left, top, width, height)
      const source = rasterSnapshotRegion(tool === 'history-brush' ? stroke.history : stroke.before, left, top, width, height)
      const region = applyRetouchStamp(after, source, x - left, y - top, stroke.radius, {
        mode: tool,
        color,
        strength: strength * flow / 100,
        pattern: document.pattern,
        targetColor: stroke.targetColor,
        mixerColor: stroke.mixerColor,
        delta: { x: x - previous.x, y: y - previous.y },
        origin: { x: left, y: top },
        toneRange,
        protectTones,
        spongeMode,
        vibrance,
      })
      context.putImageData(after, left, top, region.x, region.y, region.width, region.height)
      stroke.minX = Math.min(stroke.minX, left + region.x)
      stroke.minY = Math.min(stroke.minY, top + region.y)
      stroke.maxX = Math.max(stroke.maxX, left + region.x + region.width)
      stroke.maxY = Math.max(stroke.maxY, top + region.y + region.height)
    }
    stroke.last = point
    if (stroke.previewing) strokePreview.schedulePreview()
    else onChange(stroke.target.layer.assetId, {
      x: Math.max(0, Math.floor(Math.min(previous.x, point.x) - stroke.radius)),
      y: Math.max(0, Math.floor(Math.min(previous.y, point.y) - stroke.radius)),
      width: Math.ceil(Math.abs(point.x - previous.x) + stroke.radius * 2),
      height: Math.ceil(Math.abs(point.y - previous.y) + stroke.radius * 2),
    })
  }

  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!target || target.locked) return
    const context = target.surface.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const point = canvasToSource(canvasPoint(event), target)
    const before = createRasterTileSnapshot(target.surface)
    if (historyRef.current?.assetId !== target.layer.assetId) historyRef.current = { assetId: target.layer.assetId, snapshot: createRasterTileSnapshot(target.surface) }
    const history = historyRef.current.snapshot
    const radius = Math.max(0.5, size / (target.bounds.width / target.surface.width) / 2)
    const sampleLeft = Math.max(0, Math.floor(point.x - radius))
    const sampleTop = Math.max(0, Math.floor(point.y - radius))
    const sampleWidth = Math.max(1, Math.min(target.surface.width - sampleLeft, Math.ceil(radius * 2 + 1)))
    const sampleHeight = Math.max(1, Math.min(target.surface.height - sampleTop, Math.ceil(radius * 2 + 1)))
    captureRasterTiles(before, sampleLeft, sampleTop, sampleWidth, sampleHeight)
    captureRasterTiles(history, sampleLeft, sampleTop, sampleWidth, sampleHeight)
    const sample = context.getImageData(sampleLeft, sampleTop, sampleWidth, sampleHeight)
    const sampleX = Math.max(0, Math.min(sample.width - 1, Math.round(point.x - sampleLeft)))
    const sampleY = Math.max(0, Math.min(sample.height - 1, Math.round(point.y - sampleTop)))
    const sampleOffset = (sampleY * sample.width + sampleX) * 4
    const selectionContext = selection?.bounds ? selection.mask.getContext('2d', { willReadFrequently: true }) : null
    const selectionData = selectionContext && selection ? selectionContext.getImageData(0, 0, selection.mask.width, selection.mask.height) : null
    const previewing = !selectionData && geometryTransformIsIdentity(target.layer.geometryTransform) && !target.layer.maskAssetId && !target.layer.vectorMask && !target.layer.clipToBelow
    const stroke: Stroke = {
      pointerId: event.pointerId,
      target,
      before,
      history,
      last: point,
      radius,
      targetColor: [sample.data[sampleOffset], sample.data[sampleOffset + 1], sample.data[sampleOffset + 2]],
      mixerColor: sampleAverageColor(sample, point.x - sampleLeft, point.y - sampleTop, radius),
      minX: point.x - radius,
      minY: point.y - radius,
      maxX: point.x + radius,
      maxY: point.y + radius,
      selectionData,
      previewing,
    }
    strokeRef.current = stroke
    if (previewing) strokePreview.beginPreview()
    paint(stroke, point)
    if (previewing) strokePreview.drawPreview()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Synthetic events do not expose capture. */ }
  }

  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const stroke = strokeRef.current
    if (!stroke || stroke.pointerId !== event.pointerId) return
    paint(stroke, canvasToSource(canvasPoint(event), stroke.target))
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
    const x = Math.max(0, Math.floor(stroke.minX))
    const y = Math.max(0, Math.floor(stroke.minY))
    const width = Math.min(stroke.target.surface.width - x, Math.ceil(stroke.maxX) - x)
    const height = Math.min(stroke.target.surface.height - y, Math.ceil(stroke.maxY) - y)
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

  return <Fragment>
    <canvas ref={strokePreview.previewCanvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 hidden size-full" />
    <svg aria-label={`${tool} surface`} viewBox={`0 0 ${canvas?.width ?? 1600} ${canvas?.height ?? 1000}`} preserveAspectRatio="none" className={`absolute inset-0 size-full touch-none ${target && !target.locked ? 'cursor-crosshair' : 'cursor-not-allowed'}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} />
  </Fragment>
}
