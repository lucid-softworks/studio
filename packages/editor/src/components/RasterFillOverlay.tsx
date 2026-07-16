import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { hexToRgba, type RasterEdit, type RasterRegion } from '../editor/raster'
import { canvasToSource, constrainRasterRegion, resolveRasterTarget, sourceToCanvas, type RasterTarget } from '../editor/raster-target'
import type { SelectionState } from '../editor/selection'
import type { AssetMap } from '../editor/runtime-assets'
import type { EditorDocument, Position } from '../editor/types'
import type { GradientStop } from '../editor/gradients'

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  document: EditorDocument
  assets: AssetMap
  tool: 'fill' | 'gradient'
  color: string
  secondaryColor: string
  gradientStops: GradientStop[]
  tolerance: number
  selection: SelectionState | null
  maskAssetId?: string
  maskLocked?: boolean
  locked?: boolean
  onChange: (assetId: string, region?: RasterRegion) => void
  onCommit: (edit: RasterEdit) => void
}

type GradientDrag = { pointerId: number; target: RasterTarget; start: Position; before: ImageData }

export function RasterFillOverlay({ canvasRef, document, assets, tool, color, secondaryColor, gradientStops, tolerance, selection, maskAssetId, maskLocked, locked, onChange, onCommit }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<GradientDrag | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const requestRef = useRef(0)
  const [preview, setPreview] = useState<{ start: Position; end: Position } | null>(null)
  const [busy, setBusy] = useState(false)
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

  const cancelWorker = () => {
    workerRef.current?.terminate()
    workerRef.current = null
    requestRef.current += 1
    setBusy(false)
  }

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') cancelWorker() }
    window.addEventListener('keydown', keyDown)
    return () => { window.removeEventListener('keydown', keyDown); workerRef.current?.terminate() }
  }, [])

  const fill = (current: RasterTarget, point: Position) => {
    const context = current.surface.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const image = context.getImageData(0, 0, current.surface.width, current.surface.height)
    cancelWorker()
    const id = requestRef.current
    const worker = new Worker(new URL('../editor/workers/raster-ops.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    setBusy(true)
    worker.onmessage = (message: MessageEvent<{ id: number; region?: RasterRegion | null; before?: ArrayBuffer; after?: ArrayBuffer; error?: string }>) => {
      if (message.data.id !== id || workerRef.current !== worker) return
      worker.terminate()
      workerRef.current = null
      setBusy(false)
      const region = message.data.region
      if (!region || !message.data.before || !message.data.after) return
      const before = new ImageData(new Uint8ClampedArray(message.data.before), region.width, region.height)
      const generated = new ImageData(new Uint8ClampedArray(message.data.after), region.width, region.height)
      const after = constrainRasterRegion(before, generated, region.x, region.y, current, selectionData())
      context.putImageData(after, region.x, region.y)
      onChange(current.layer.assetId, region)
      onCommit({ assetId: current.layer.assetId, ...region, before, after })
    }
    worker.onerror = () => { if (workerRef.current === worker) { workerRef.current = null; setBusy(false) }; worker.terminate() }
    worker.postMessage({ id, operation: 'flood-fill', data: image.data.buffer, width: image.width, height: image.height, x: point.x, y: point.y, replacement: hexToRgba(maskAssetId ? '#ffffff' : color), tolerance }, [image.data.buffer])
  }

  const gradient = (drag: GradientDrag, end: Position) => {
    const { target: current } = drag
    const context = current.surface.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const after = context.createImageData(current.surface.width, current.surface.height)
    after.data.set(drag.before.data)
    const stops = maskAssetId ? [{ color: '#ffffff', position: 0 }, { color: '#000000', position: 100 }] : gradientStops.length >= 2 ? gradientStops : [{ color, position: 0 }, { color: secondaryColor, position: 100 }]
    const dx = end.x - drag.start.x
    const dy = end.y - drag.start.y
    const lengthSquared = Math.max(1, dx * dx + dy * dy)
    for (let y = 0; y < after.height; y += 1) {
      for (let x = 0; x < after.width; x += 1) {
        const amount = Math.max(0, Math.min(1, ((x - drag.start.x) * dx + (y - drag.start.y) * dy) / lengthSquared))
        const offset = (y * after.width + x) * 4
        const position = amount * 100
        const rightIndex = Math.max(1, stops.findIndex((stop) => stop.position >= position))
        const leftStop = stops[rightIndex - 1]
        const rightStop = stops[rightIndex] ?? stops.at(-1)!
        const localAmount = Math.max(0, Math.min(1, (position - leftStop.position) / Math.max(0.001, rightStop.position - leftStop.position)))
        const startColor = hexToRgba(leftStop.color)
        const endColor = hexToRgba(rightStop.color)
        for (let channel = 0; channel < 4; channel += 1) after.data[offset + channel] = Math.round(startColor[channel] + (endColor[channel] - startColor[channel]) * localAmount)
      }
    }
    constrainRasterRegion(drag.before, after, 0, 0, current, selectionData())
    context.putImageData(after, 0, 0)
    onChange(current.layer.assetId, { x: 0, y: 0, width: after.width, height: after.height })
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
      aria-busy={busy}
      viewBox={`0 0 ${canvas?.width ?? 1600} ${canvas?.height ?? 1000}`}
      preserveAspectRatio="none"
      className={`absolute inset-0 size-full touch-none ${target && !target.locked ? busy ? 'cursor-progress' : 'cursor-crosshair' : 'cursor-not-allowed'}`}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={() => { dragRef.current = null; setPreview(null) }}
    >
      {preview && <><line x1={preview.start.x} y1={preview.start.y} x2={preview.end.x} y2={preview.end.y} stroke="#ffffff" strokeWidth="3" vectorEffect="non-scaling-stroke" /><circle cx={preview.start.x} cy={preview.start.y} r="7" fill="#18181b" stroke="#ffffff" strokeWidth="2" vectorEffect="non-scaling-stroke" /><circle cx={preview.end.x} cy={preview.end.y} r="7" fill="#18181b" stroke="#ffffff" strokeWidth="2" vectorEffect="non-scaling-stroke" /></>}
    </svg>
  )
}
