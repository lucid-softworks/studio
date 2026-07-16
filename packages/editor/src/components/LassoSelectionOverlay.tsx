import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { applySelectionPolygon, type SelectionMode, type SelectionState } from '../editor/selection'
import type { Position } from '../editor/types'

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  enabled: boolean
  mode: SelectionMode
  selection: SelectionState | null
  onChange: (selection: SelectionState | null) => void
  magnetic?: boolean
}

type Drag = { pointerId: number; points: Position[] }

export function LassoSelectionOverlay({ canvasRef, enabled, mode, selection, onChange, magnetic = false }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [preview, setPreview] = useState<Position[]>([])
  const canvas = canvasRef.current

  const point = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const width = canvas?.width ?? 1600
    const height = canvas?.height ?? 1000
    const raw = { x: (event.clientX - rect.left) / rect.width * width, y: (event.clientY - rect.top) / rect.height * height }
    if (!magnetic || !canvas) return raw
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return raw
    const radius = Math.max(3, Math.round(width / 300))
    const left = Math.max(1, Math.floor(raw.x) - radius)
    const top = Math.max(1, Math.floor(raw.y) - radius)
    const right = Math.min(width - 2, Math.floor(raw.x) + radius)
    const bottom = Math.min(height - 2, Math.floor(raw.y) + radius)
    if (right < left || bottom < top) return raw
    const image = context.getImageData(left - 1, top - 1, right - left + 3, bottom - top + 3)
    const luminance = (x: number, y: number) => {
      const offset = (y * image.width + x) * 4
      return image.data[offset] * 0.299 + image.data[offset + 1] * 0.587 + image.data[offset + 2] * 0.114
    }
    let best = raw
    let strength = -1
    for (let y = 1; y < image.height - 1; y += 1) for (let x = 1; x < image.width - 1; x += 1) {
      const gradient = Math.abs(luminance(x + 1, y) - luminance(x - 1, y)) + Math.abs(luminance(x, y + 1) - luminance(x, y - 1))
      if (gradient > strength) { strength = gradient; best = { x: left + x - 1, y: top + y - 1 } }
    }
    return best
  }

  return (
    <svg
      ref={svgRef}
      aria-label={`${magnetic ? 'Magnetic lasso' : 'Lasso'} selection surface`}
      viewBox={`0 0 ${canvas?.width ?? 1600} ${canvas?.height ?? 1000}`}
      preserveAspectRatio="none"
      className={`absolute inset-0 size-full touch-none ${enabled ? 'cursor-crosshair' : 'pointer-events-none'}`}
      onPointerDown={(event) => {
        if (!enabled) return
        const start = point(event)
        dragRef.current = { pointerId: event.pointerId, points: [start] }
        setPreview([start])
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Synthetic browser events do not expose capture. */ }
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        const next = point(event)
        const previous = drag.points.at(-1)!
        if (Math.hypot(next.x - previous.x, next.y - previous.y) < (canvas?.width ?? 1600) / 300) return
        drag.points.push(next)
        setPreview([...drag.points])
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId || !canvas) return
        dragRef.current = null
        setPreview([])
        if (drag.points.length >= 3) onChange(applySelectionPolygon(selection, drag.points, mode, canvas.width, canvas.height))
      }}
      onPointerCancel={() => { dragRef.current = null; setPreview([]) }}
    >
      {preview.length > 1 && <path d={`${preview.map((item, index) => `${index ? 'L' : 'M'} ${item.x} ${item.y}`).join(' ')} Z`} fill="rgba(139,92,246,0.12)" stroke="#c4b5fd" strokeWidth="2" strokeDasharray="10 7" vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}
