import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { extractImageData, type RasterEdit } from '../editor/raster'
import { canvasToSource, constrainRasterRegion, resolveRasterTarget, sourceToCanvas, type RasterTarget } from '../editor/raster-target'
import type { SelectionState } from '../editor/selection'
import type { AssetMap } from '../editor/runtime-assets'
import type { EditorDocument, Position } from '../editor/types'

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  document: EditorDocument
  assets: AssetMap
  tool: 'clone-stamp' | 'healing'
  size: number
  strength: number
  selection: SelectionState | null
  locked?: boolean
  onChange: (assetId: string) => void
  onCommit: (edit: RasterEdit) => void
}

type Source = { assetId: string; point: Position }
type Stroke = {
  pointerId: number
  target: RasterTarget
  before: ImageData
  snapshot: HTMLCanvasElement
  last: Position
  offset: Position
  radius: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  selectionData: ImageData | null
}

export function CloneStampOverlay({ canvasRef, document, assets, tool, size, strength, selection, locked, onChange, onCommit }: Props) {
  const strokeRef = useRef<Stroke | null>(null)
  const [source, setSource] = useState<Source | null>(null)
  const canvas = canvasRef.current
  const target = canvas ? resolveRasterTarget(canvas, document, assets, undefined, undefined, locked) : null

  const canvasPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / rect.width * (canvas?.width ?? 1600), y: (event.clientY - rect.top) / rect.height * (canvas?.height ?? 1000) }
  }

  const stamp = (stroke: Stroke, destination: Position) => {
    const context = stroke.target.surface.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const distance = Math.hypot(destination.x - stroke.last.x, destination.y - stroke.last.y)
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, stroke.radius * 0.3)))
    for (let step = 1; step <= steps; step += 1) {
      const amount = step / steps
      const x = stroke.last.x + (destination.x - stroke.last.x) * amount
      const y = stroke.last.y + (destination.y - stroke.last.y) * amount
      const sourceX = x + stroke.offset.x
      const sourceY = y + stroke.offset.y
      context.save()
      context.beginPath()
      context.arc(x, y, stroke.radius, 0, Math.PI * 2)
      context.clip()
      context.globalAlpha = tool === 'healing' ? Math.min(0.72, strength / 100) : strength / 100
      context.drawImage(stroke.snapshot, sourceX - stroke.radius, sourceY - stroke.radius, stroke.radius * 2, stroke.radius * 2, x - stroke.radius, y - stroke.radius, stroke.radius * 2, stroke.radius * 2)
      context.restore()
      stroke.minX = Math.min(stroke.minX, x - stroke.radius)
      stroke.minY = Math.min(stroke.minY, y - stroke.radius)
      stroke.maxX = Math.max(stroke.maxX, x + stroke.radius)
      stroke.maxY = Math.max(stroke.maxY, y + stroke.radius)
    }
    stroke.last = destination
    onChange(stroke.target.layer.assetId)
  }

  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!target || target.locked) return
    const point = canvasToSource(canvasPoint(event), target)
    if (event.altKey || !source || source.assetId !== target.layer.assetId) {
      setSource({ assetId: target.layer.assetId, point })
      return
    }
    const context = target.surface.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const before = context.getImageData(0, 0, target.surface.width, target.surface.height)
    const snapshot = window.document.createElement('canvas')
    snapshot.width = target.surface.width
    snapshot.height = target.surface.height
    snapshot.getContext('2d')?.putImageData(before, 0, 0)
    const radius = Math.max(0.5, size / (target.bounds.width / target.surface.width) / 2)
    const selectionContext = selection?.bounds ? selection.mask.getContext('2d', { willReadFrequently: true }) : null
    const stroke: Stroke = {
      pointerId: event.pointerId,
      target,
      before,
      snapshot,
      last: point,
      offset: { x: source.point.x - point.x, y: source.point.y - point.y },
      radius,
      minX: point.x - radius,
      minY: point.y - radius,
      maxX: point.x + radius,
      maxY: point.y + radius,
      selectionData: selectionContext && selection ? selectionContext.getImageData(0, 0, selection.mask.width, selection.mask.height) : null,
    }
    strokeRef.current = stroke
    stamp(stroke, point)
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
    const context = stroke.target.surface.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const x = Math.max(0, Math.floor(stroke.minX - 2))
    const y = Math.max(0, Math.floor(stroke.minY - 2))
    const width = Math.min(stroke.target.surface.width - x, Math.ceil(stroke.maxX + 2) - x)
    const height = Math.min(stroke.target.surface.height - y, Math.ceil(stroke.maxY + 2) - y)
    if (width <= 0 || height <= 0) return
    const before = extractImageData(stroke.before, x, y, width, height)
    const after = constrainRasterRegion(before, context.getImageData(x, y, width, height), x, y, stroke.target, stroke.selectionData)
    context.putImageData(after, x, y)
    onChange(stroke.target.layer.assetId)
    onCommit({ assetId: stroke.target.layer.assetId, x, y, before, after })
  }

  const marker = source && target && source.assetId === target.layer.assetId ? sourceToCanvas(source.point, target) : null

  return (
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
  )
}
