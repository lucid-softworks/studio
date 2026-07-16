import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { Position } from '../editor/types'

type Props = { canvasRef: RefObject<HTMLCanvasElement | null>; enabled: boolean; value: [Position, Position, Position, Position]; onChange: (value: [Position, Position, Position, Position]) => void }

export function PerspectiveCropOverlay({ canvasRef, enabled, value, onChange }: Props) {
  const point = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const canvas = canvasRef.current
    return canvas ? { x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) / rect.width * canvas.width)), y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) / rect.height * canvas.height)) } : { x: 0, y: 0 }
  }
  const down = (event: ReactPointerEvent<SVGCircleElement>, index: number) => {
    event.stopPropagation()
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    svg.setPointerCapture(event.pointerId)
    const move = (moveEvent: PointerEvent) => {
      const rect = svg.getBoundingClientRect()
      const canvas = canvasRef.current
      if (!canvas) return
      const next = structuredClone(value)
      next[index] = { x: Math.max(0, Math.min(canvas.width, (moveEvent.clientX - rect.left) / rect.width * canvas.width)), y: Math.max(0, Math.min(canvas.height, (moveEvent.clientY - rect.top) / rect.height * canvas.height)) }
      onChange(next)
    }
    const finish = () => { svg.removeEventListener('pointermove', move); svg.removeEventListener('pointerup', finish); svg.removeEventListener('pointercancel', finish) }
    svg.addEventListener('pointermove', move)
    svg.addEventListener('pointerup', finish)
    svg.addEventListener('pointercancel', finish)
  }
  const start = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!enabled) return
    const origin = point(event)
    onChange([origin, origin, origin, origin])
  }
  if (!enabled) return null
  const points = value.map((position) => `${position.x},${position.y}`).join(' ')
  return <svg aria-label="Perspective crop surface" viewBox={`0 0 ${canvasRef.current?.width ?? 1600} ${canvasRef.current?.height ?? 1000}`} preserveAspectRatio="none" className="absolute inset-0 size-full touch-none" onPointerDown={start}><polygon points={points} fill="rgba(15,23,42,.12)" stroke="#a78bfa" strokeWidth="2" vectorEffect="non-scaling-stroke" />{value.map((position, index) => <circle key={index} cx={position.x} cy={position.y} r="8" fill="#111113" stroke="#c4b5fd" strokeWidth="2" vectorEffect="non-scaling-stroke" onPointerDown={(event) => down(event, index)} />)}</svg>
}
