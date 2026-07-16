import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { extractImageData, type RasterEdit, type RasterRegion } from '../editor/raster'
import { canvasToSource, constrainRasterRegion, resolveRasterTarget, sourceToCanvas, type RasterTarget } from '../editor/raster-target'
import type { SelectionState } from '../editor/selection'
import type { AssetMap } from '../editor/runtime-assets'
import type { EditorDocument, Position } from '../editor/types'
import { renderComposition } from '../editor/renderer'

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

export function CloneStampOverlay({ canvasRef, document, assets, tool, size, strength, aligned, sampleMode, sourceRotation, sourceScale, selection, locked, onChange, onCommit }: Props) {
  const strokeRef = useRef<Stroke | null>(null)
  const alignedOffsetRef = useRef<Position | null>(null)
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
    const previous = stroke.last
    const distance = Math.hypot(destination.x - previous.x, destination.y - previous.y)
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, stroke.radius * 0.3)))
    for (let step = 1; step <= steps; step += 1) {
      const amount = step / steps
      const x = previous.x + (destination.x - previous.x) * amount
      const y = previous.y + (destination.y - previous.y) * amount
      const sourceX = x + stroke.offset.x
      const sourceY = y + stroke.offset.y
      context.save()
      context.beginPath()
      context.arc(x, y, stroke.radius, 0, Math.PI * 2)
      context.clip()
      context.globalAlpha = tool === 'healing' ? Math.min(0.72, strength / 100) : strength / 100
      context.globalCompositeOperation = tool === 'healing' ? 'luminosity' : 'source-over'
      context.translate(x, y)
      context.rotate(sourceRotation * Math.PI / 180)
      context.scale(sourceScale / 100, sourceScale / 100)
      context.drawImage(stroke.snapshot, sourceX - stroke.radius, sourceY - stroke.radius, stroke.radius * 2, stroke.radius * 2, -stroke.radius, -stroke.radius, stroke.radius * 2, stroke.radius * 2)
      context.restore()
      stroke.minX = Math.min(stroke.minX, x - stroke.radius)
      stroke.minY = Math.min(stroke.minY, y - stroke.radius)
      stroke.maxX = Math.max(stroke.maxX, x + stroke.radius)
      stroke.maxY = Math.max(stroke.maxY, y + stroke.radius)
    }
    stroke.last = destination
    onChange(stroke.target.layer.assetId, {
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
    const before = context.getImageData(0, 0, target.surface.width, target.surface.height)
    const snapshot = window.document.createElement('canvas')
    snapshot.width = target.surface.width
    snapshot.height = target.surface.height
    const snapshotContext = snapshot.getContext('2d')
    if (sampleMode === 'current') snapshotContext?.putImageData(before, 0, 0)
    else if (snapshotContext && canvas) {
      const selectedIndex = document.layers.findIndex((layer) => layer.id === target.layer.id)
      const merged = window.document.createElement('canvas')
      renderComposition(merged, { ...document, layers: selectedIndex < 0 ? document.layers : document.layers.slice(0, selectedIndex + 1) }, assets)
      snapshotContext.translate(target.surface.width / 2, target.surface.height / 2)
      snapshotContext.scale(target.surface.width / target.bounds.width, target.surface.height / target.bounds.height)
      snapshotContext.rotate(-target.bounds.rotation * Math.PI / 180)
      snapshotContext.drawImage(merged, -target.bounds.x - target.bounds.width / 2, -target.bounds.y - target.bounds.height / 2)
    }
    const radius = Math.max(0.5, size / (target.bounds.width / target.surface.width) / 2)
    const selectionContext = selection?.bounds ? selection.mask.getContext('2d', { willReadFrequently: true }) : null
    const strokeOffset = aligned && alignedOffsetRef.current ? alignedOffsetRef.current : { x: source.point.x - point.x, y: source.point.y - point.y }
    if (aligned) alignedOffsetRef.current = strokeOffset
    const stroke: Stroke = {
      pointerId: event.pointerId,
      target,
      before,
      snapshot,
      last: point,
      offset: strokeOffset,
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
    onChange(stroke.target.layer.assetId, { x, y, width, height })
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
