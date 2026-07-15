import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { extractImageData, floodFillImageData, hexToRgba, type RasterEdit } from '../editor/raster'
import { canvasToSource, constrainRasterRegion, resolveRasterTarget, sourceToCanvas, type RasterTarget } from '../editor/raster-target'
import type { SelectionState } from '../editor/selection'
import type { AssetMap } from '../editor/runtime-assets'
import type { EditorDocument, Position } from '../editor/types'

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  document: EditorDocument
  assets: AssetMap
  tool: 'fill' | 'gradient'
  color: string
  secondaryColor: string
  tolerance: number
  selection: SelectionState | null
  maskAssetId?: string
  maskLocked?: boolean
  locked?: boolean
  onChange: (assetId: string) => void
  onCommit: (edit: RasterEdit) => void
}

type GradientDrag = { pointerId: number; target: RasterTarget; start: Position; before: ImageData }

export function RasterFillOverlay({ canvasRef, document, assets, tool, color, secondaryColor, tolerance, selection, maskAssetId, maskLocked, locked, onChange, onCommit }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<GradientDrag | null>(null)
  const [preview, setPreview] = useState<{ start: Position; end: Position } | null>(null)
  const canvas = canvasRef.current
  const target = canvas ? resolveRasterTarget(canvas, document, assets, maskAssetId, maskLocked, locked) : null

  const canvasPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / rect.width * (canvas?.width ?? 1600), y: (event.clientY - rect.top) / rect.height * (canvas?.height ?? 1000) }
  }

  const selectionData = () => {
    const context = selection?.bounds ? selection.mask.getContext('2d', { willReadFrequently: true }) : null
    return context && selection ? context.getImageData(0, 0, selection.mask.width, selection.mask.height) : null
  }

  const fill = (current: RasterTarget, point: Position) => {
    const context = current.surface.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const beforeFull = context.getImageData(0, 0, current.surface.width, current.surface.height)
    const afterFull = context.createImageData(current.surface.width, current.surface.height)
    afterFull.data.set(beforeFull.data)
    const region = floodFillImageData(afterFull, point.x, point.y, hexToRgba(maskAssetId ? '#ffffff' : color), tolerance)
    if (!region) return
    const before = extractImageData(beforeFull, region.x, region.y, region.width, region.height)
    const after = constrainRasterRegion(extractImageData(beforeFull, region.x, region.y, region.width, region.height), extractImageData(afterFull, region.x, region.y, region.width, region.height), region.x, region.y, current, selectionData())
    context.putImageData(after, region.x, region.y)
    onChange(current.layer.assetId)
    onCommit({ assetId: current.layer.assetId, ...region, before, after })
  }

  const gradient = (drag: GradientDrag, end: Position) => {
    const { target: current } = drag
    const context = current.surface.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const after = context.createImageData(current.surface.width, current.surface.height)
    after.data.set(drag.before.data)
    const startColor = hexToRgba(maskAssetId ? '#ffffff' : color)
    const endColor = hexToRgba(maskAssetId ? '#000000' : secondaryColor)
    const dx = end.x - drag.start.x
    const dy = end.y - drag.start.y
    const lengthSquared = Math.max(1, dx * dx + dy * dy)
    for (let y = 0; y < after.height; y += 1) {
      for (let x = 0; x < after.width; x += 1) {
        const amount = Math.max(0, Math.min(1, ((x - drag.start.x) * dx + (y - drag.start.y) * dy) / lengthSquared))
        const offset = (y * after.width + x) * 4
        for (let channel = 0; channel < 4; channel += 1) after.data[offset + channel] = Math.round(startColor[channel] + (endColor[channel] - startColor[channel]) * amount)
      }
    }
    constrainRasterRegion(drag.before, after, 0, 0, current, selectionData())
    context.putImageData(after, 0, 0)
    onChange(current.layer.assetId)
    onCommit({ assetId: current.layer.assetId, x: 0, y: 0, before: drag.before, after })
  }

  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!target || target.locked) return
    const source = canvasToSource(canvasPoint(event), target)
    event.preventDefault()
    if (tool === 'fill') {
      fill(target, source)
      return
    }
    const context = target.surface.getContext('2d', { willReadFrequently: true })
    if (!context) return
    dragRef.current = { pointerId: event.pointerId, target, start: source, before: context.getImageData(0, 0, target.surface.width, target.surface.height) }
    setPreview({ start: sourceToCanvas(source, target), end: sourceToCanvas(source, target) })
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Synthetic browser events do not expose capture. */ }
  }

  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPreview({ start: sourceToCanvas(drag.start, drag.target), end: canvasPoint(event) })
  }

  const pointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setPreview(null)
    gradient(drag, canvasToSource(canvasPoint(event), drag.target))
  }

  return (
    <svg
      ref={svgRef}
      aria-label={`${tool === 'fill' ? 'Paint bucket' : 'Gradient'} surface`}
      viewBox={`0 0 ${canvas?.width ?? 1600} ${canvas?.height ?? 1000}`}
      preserveAspectRatio="none"
      className={`absolute inset-0 size-full touch-none ${target && !target.locked ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={() => { dragRef.current = null; setPreview(null) }}
    >
      {preview && <><line x1={preview.start.x} y1={preview.start.y} x2={preview.end.x} y2={preview.end.y} stroke="#ffffff" strokeWidth="3" vectorEffect="non-scaling-stroke" /><circle cx={preview.start.x} cy={preview.start.y} r="7" fill="#18181b" stroke="#ffffff" strokeWidth="2" vectorEffect="non-scaling-stroke" /><circle cx={preview.end.x} cy={preview.end.y} r="7" fill="#18181b" stroke="#ffffff" strokeWidth="2" vectorEffect="non-scaling-stroke" /></>}
    </svg>
  )
}
