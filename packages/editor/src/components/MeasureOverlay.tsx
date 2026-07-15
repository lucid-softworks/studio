import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

export type Measurement = { startX: number; startY: number; endX: number; endY: number }

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  enabled: boolean
  value: Measurement | null
  onChange: (measurement: Measurement | null) => void
}

type Drag = { pointerId: number; startX: number; startY: number }

export function MeasureOverlay({ canvasRef, enabled, value, onChange }: Props) {
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const canvas = canvasRef.current

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay || !canvas) return
    if (overlay.width !== canvas.width) overlay.width = canvas.width
    if (overlay.height !== canvas.height) overlay.height = canvas.height
    const context = overlay.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, overlay.width, overlay.height)
    if (!value) return
    const radius = Math.max(4, overlay.width / 220)
    context.save()
    context.lineWidth = Math.max(2, overlay.width / 700)
    context.strokeStyle = '#c4b5fd'
    context.shadowColor = 'rgba(0,0,0,.8)'
    context.shadowBlur = Math.max(2, overlay.width / 500)
    context.beginPath()
    context.moveTo(value.startX, value.startY)
    context.lineTo(value.endX, value.endY)
    context.stroke()
    for (const [x, y] of [[value.startX, value.startY], [value.endX, value.endY]]) {
      context.fillStyle = '#18181b'
      context.beginPath()
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.fill()
      context.strokeStyle = '#ddd6fe'
      context.stroke()
    }
    context.restore()
  }, [canvas, value])

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / rect.width * event.currentTarget.width, y: (event.clientY - rect.top) / rect.height * event.currentTarget.height }
  }

  const endPoint = (event: ReactPointerEvent<HTMLCanvasElement>, drag: Drag) => {
    const end = point(event)
    if (!event.shiftKey) return end
    const distance = Math.hypot(end.x - drag.startX, end.y - drag.startY)
    const angle = Math.round(Math.atan2(end.y - drag.startY, end.x - drag.startX) / (Math.PI / 4)) * Math.PI / 4
    return { x: drag.startX + Math.cos(angle) * distance, y: drag.startY + Math.sin(angle) * distance }
  }

  return (
    <canvas
      ref={overlayRef}
      aria-label="Measure heading surface"
      className={`absolute inset-0 size-full touch-none ${enabled ? 'cursor-crosshair' : 'pointer-events-none'}`}
      onPointerDown={(event) => {
        if (!enabled || event.button !== 0) return
        const start = point(event)
        dragRef.current = { pointerId: event.pointerId, startX: start.x, startY: start.y }
        onChange({ startX: start.x, startY: start.y, endX: start.x, endY: start.y })
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Synthetic events do not expose capture. */ }
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        const end = endPoint(event, drag)
        onChange({ startX: drag.startX, startY: drag.startY, endX: end.x, endY: end.y })
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        const end = endPoint(event, drag)
        dragRef.current = null
        onChange(Math.hypot(end.x - drag.startX, end.y - drag.startY) < 1 ? null : { startX: drag.startX, startY: drag.startY, endX: end.x, endY: end.y })
      }}
      onPointerCancel={() => { dragRef.current = null }}
    />
  )
}
