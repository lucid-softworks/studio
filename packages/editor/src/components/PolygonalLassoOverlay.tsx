import { useEffect, useState, type RefObject } from 'react'
import { applySelectionPolygon, type SelectionMode, type SelectionState } from '../editor/selection'
import type { Position } from '../editor/types'

type Props = { canvasRef: RefObject<HTMLCanvasElement | null>; enabled: boolean; mode: SelectionMode; selection: SelectionState | null; onChange: (selection: SelectionState) => void }

export function PolygonalLassoOverlay({ canvasRef, enabled, mode, selection, onChange }: Props) {
  const [points, setPoints] = useState<Position[]>([])
  const [hover, setHover] = useState<Position | null>(null)
  const canvas = canvasRef.current
  useEffect(() => { if (!enabled) { setPoints([]); setHover(null) } }, [enabled])
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') setPoints([]) }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [])
  const point = (event: { clientX: number; clientY: number; currentTarget: SVGSVGElement }) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / rect.width * (canvas?.width ?? 1), y: (event.clientY - rect.top) / rect.height * (canvas?.height ?? 1) }
  }
  const finish = (next = points) => {
    if (canvas && next.length >= 3) onChange(applySelectionPolygon(selection, next, mode, canvas.width, canvas.height))
    setPoints([])
    setHover(null)
  }
  const preview = hover ? [...points, hover] : points
  return <svg aria-label="Polygonal lasso selection surface" viewBox={`0 0 ${canvas?.width ?? 1600} ${canvas?.height ?? 1000}`} preserveAspectRatio="none" className={`absolute inset-0 size-full touch-none ${enabled ? 'cursor-crosshair' : 'pointer-events-none'}`} onPointerMove={(event) => enabled && setHover(point(event))} onDoubleClick={(event) => { event.preventDefault(); finish(points.length ? [...points, point(event)] : points) }} onPointerDown={(event) => {
    if (!enabled) return
    const next = point(event)
    const first = points[0]
    if (first && points.length >= 3 && Math.hypot(next.x - first.x, next.y - first.y) < (canvas?.width ?? 1000) / 80) finish()
    else setPoints((current) => [...current, next])
  }}>{preview.length > 0 && <path d={preview.map((item, index) => `${index ? 'L' : 'M'} ${item.x} ${item.y}`).join(' ')} fill="rgba(139,92,246,0.08)" stroke="#c4b5fd" strokeWidth="2" strokeDasharray="10 7" vectorEffect="non-scaling-stroke" />}{points.map((item, index) => <circle key={index} cx={item.x} cy={item.y} r="4" fill="#c4b5fd" vectorEffect="non-scaling-stroke" />)}</svg>
}
