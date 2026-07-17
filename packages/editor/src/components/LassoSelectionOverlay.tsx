import { Fragment, useEffect, useEffectEvent, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { applySelectionPolygon, type SelectionMode, type SelectionState } from '../editor/selection'
import type { Position } from '../editor/types'

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  enabled: boolean
  mode: SelectionMode
  selection: SelectionState | null
  onChange: (selection: SelectionState | null) => void
  magnetic?: boolean
  magneticWidth?: number
  magneticContrast?: number
  magneticFrequency?: number
}

type Drag = { pointerId: number; points: Position[] }
type AnchorDrag = { pointerId: number; index: number }

export function LassoSelectionOverlay({ canvasRef, enabled, mode, selection, onChange, magnetic = false, magneticWidth = 12, magneticContrast = 20, magneticFrequency = 57 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const anchorDragRef = useRef<AnchorDrag | null>(null)
  const originalSelectionRef = useRef<SelectionState | null>(null)
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
    const radius = Math.max(3, Math.round(magneticWidth))
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
    return strength >= magneticContrast / 100 * 510 ? best : raw
  }

  const commitPreview = (points = preview) => {
    if (canvas && points.length >= 3) onChange(applySelectionPolygon(originalSelectionRef.current, points, mode, canvas.width, canvas.height))
  }

  const finishMagnetic = () => {
    commitPreview()
    setPreview([])
    originalSelectionRef.current = null
  }

  const handleMagneticKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Enter') { event.preventDefault(); finishMagnetic() }
    else if (event.key === 'Escape') { event.preventDefault(); onChange(originalSelectionRef.current); setPreview([]) }
    else if ((event.key === 'Backspace' || event.key === 'Delete') && preview.length > 3) {
      event.preventDefault()
      const next = preview.slice(0, -1)
      setPreview(next)
      commitPreview(next)
    }
  })
  const magneticEditing = enabled && magnetic && preview.length > 0
  useEffect(() => {
    if (!magneticEditing) return
    window.addEventListener('keydown', handleMagneticKey, true)
    return () => window.removeEventListener('keydown', handleMagneticKey, true)
  }, [magneticEditing])

  return (
    <Fragment>
    <svg
      ref={svgRef}
      aria-label={`${magnetic ? 'Magnetic lasso' : 'Lasso'} selection surface`}
      viewBox={`0 0 ${canvas?.width ?? 1600} ${canvas?.height ?? 1000}`}
      preserveAspectRatio="none"
      className={`absolute inset-0 size-full touch-none ${enabled ? 'cursor-crosshair' : 'pointer-events-none'}`}
      onPointerDown={(event) => {
        if (!enabled) return
        const start = point(event)
        originalSelectionRef.current = selection
        dragRef.current = { pointerId: event.pointerId, points: [start] }
        setPreview([start])
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Synthetic browser events do not expose capture. */ }
      }}
      onPointerMove={(event) => {
        const anchorDrag = anchorDragRef.current
        if (anchorDrag?.pointerId === event.pointerId) {
          const next = [...preview]
          next[anchorDrag.index] = point(event)
          setPreview(next)
          return
        }
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        const next = point(event)
        const previous = drag.points.at(-1)!
        const minimumDistance = magnetic ? Math.max(2, magneticWidth * (1.1 - magneticFrequency / 110)) : (canvas?.width ?? 1600) / 300
        if (Math.hypot(next.x - previous.x, next.y - previous.y) < minimumDistance) return
        drag.points.push(next)
        setPreview([...drag.points])
      }}
      onPointerUp={(event) => {
        const anchorDrag = anchorDragRef.current
        if (anchorDrag?.pointerId === event.pointerId) {
          anchorDragRef.current = null
          commitPreview()
          return
        }
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId || !canvas) return
        dragRef.current = null
        if (drag.points.length >= 3) {
          onChange(applySelectionPolygon(selection, drag.points, mode, canvas.width, canvas.height))
          if (magnetic) setPreview([...drag.points])
          else setPreview([])
        } else setPreview([])
      }}
      onPointerCancel={() => { dragRef.current = null; setPreview([]) }}
    >
      {preview.length > 1 && <path d={`${preview.map((item, index) => `${index ? 'L' : 'M'} ${item.x} ${item.y}`).join(' ')} Z`} fill="rgba(139,92,246,0.12)" stroke="#c4b5fd" strokeWidth="2" strokeDasharray="10 7" vectorEffect="non-scaling-stroke" className="pointer-events-none" />}
      {magnetic && preview.map((anchor, index) => <circle key={`${anchor.x}:${anchor.y}:${index}`} aria-label={`Magnetic anchor ${index + 1}`} cx={anchor.x} cy={anchor.y} r="5" fill="#18181b" stroke="#c4b5fd" strokeWidth="2" vectorEffect="non-scaling-stroke" onPointerDown={(event) => { event.stopPropagation(); anchorDragRef.current = { pointerId: event.pointerId, index }; event.currentTarget.setPointerCapture(event.pointerId) }} />)}
    </svg>
    {magnetic && preview.length >= 3 && <div className="absolute right-3 bottom-3 z-20 flex items-center gap-1 rounded-lg border border-white/[0.1] bg-[#18181b]/95 p-1.5 shadow-xl"><button type="button" onClick={finishMagnetic} className="rounded-md bg-violet-500 px-2.5 py-1.5 text-[9px] font-semibold text-white">Done</button><button type="button" disabled={preview.length <= 3} onClick={() => { const next = preview.slice(0, -1); setPreview(next); commitPreview(next) }} className="rounded-md px-2 py-1.5 text-[9px] text-zinc-400 disabled:opacity-30">Delete last</button><button type="button" onClick={() => { onChange(originalSelectionRef.current); setPreview([]) }} className="rounded-md px-2 py-1.5 text-[9px] text-zinc-500">Cancel</button></div>}
    </Fragment>
  )
}
