import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { applySelectionPolygon, type SelectionMode, type SelectionState } from '../editor/selection'
import type { Position } from '../editor/types'

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  enabled: boolean
  mode: SelectionMode
  selection: SelectionState | null
  onChange: (selection: SelectionState | null) => void
}

type Drag = { pointerId: number; points: Position[] }

export function LassoSelectionOverlay({ canvasRef, enabled, mode, selection, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [preview, setPreview] = useState<Position[]>([])
  const canvas = canvasRef.current

  const point = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const width = canvas?.width ?? 1600
    const height = canvas?.height ?? 1000
    return { x: (event.clientX - rect.left) / rect.width * width, y: (event.clientY - rect.top) / rect.height * height }
  }

  return (
    <svg
      ref={svgRef}
      aria-label="Lasso selection surface"
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
