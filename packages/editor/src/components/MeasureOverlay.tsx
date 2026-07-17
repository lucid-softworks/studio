import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

export type Measurement = { startX: number; startY: number; endX: number; endY: number }

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  enabled: boolean
  value: Measurement | null
  records?: readonly Measurement[]
  onChange: (measurement: Measurement | null) => void
}

type Drag = { pointerId: number; startX: number; startY: number }
const emptyMeasurements: readonly Measurement[] = []

function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  return { x: (event.clientX - rect.left) / rect.width * event.currentTarget.width, y: (event.clientY - rect.top) / rect.height * event.currentTarget.height }
}

function constrainedEndPoint(event: ReactPointerEvent<HTMLCanvasElement>, drag: Drag) {
  const end = canvasPoint(event)
  if (!event.shiftKey) return end
  const distance = Math.hypot(end.x - drag.startX, end.y - drag.startY)
  const angle = Math.round(Math.atan2(end.y - drag.startY, end.x - drag.startX) / (Math.PI / 4)) * Math.PI / 4
  return { x: drag.startX + Math.cos(angle) * distance, y: drag.startY + Math.sin(angle) * distance }
}

export function MeasureOverlay({ canvasRef, enabled, value, records = emptyMeasurements, onChange }: Props) {
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
    const radius = Math.max(4, overlay.width / 220)
    const drawMeasurement = (measurement: Measurement, active: boolean) => {
      context.save()
      context.lineWidth = Math.max(active ? 2 : 1.5, overlay.width / 700)
      context.strokeStyle = active ? '#c4b5fd' : 'rgba(103,232,249,.72)'
      context.shadowColor = 'rgba(0,0,0,.8)'
      context.shadowBlur = Math.max(2, overlay.width / 500)
      context.beginPath()
      context.moveTo(measurement.startX, measurement.startY)
      context.lineTo(measurement.endX, measurement.endY)
      context.stroke()
      for (const [x, y] of [[measurement.startX, measurement.startY], [measurement.endX, measurement.endY]]) {
        context.fillStyle = '#18181b'
        context.beginPath()
        context.arc(x, y, active ? radius : radius * 0.72, 0, Math.PI * 2)
        context.fill()
        context.strokeStyle = active ? '#ddd6fe' : '#67e8f9'
        context.stroke()
      }
      context.restore()
    }
    records.forEach((measurement) => drawMeasurement(measurement, false))
    if (value) drawMeasurement(value, true)
  }, [canvas, records, value])

  return (
    <canvas
      ref={overlayRef}
      aria-label="Measure heading surface"
      className={`absolute inset-0 size-full touch-none ${enabled ? 'cursor-crosshair' : 'pointer-events-none'}`}
      onPointerDown={(event) => {
        if (!enabled || event.button !== 0) return
        const start = canvasPoint(event)
        dragRef.current = { pointerId: event.pointerId, startX: start.x, startY: start.y }
        onChange({ startX: start.x, startY: start.y, endX: start.x, endY: start.y })
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Synthetic events do not expose capture. */ }
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        const end = constrainedEndPoint(event, drag)
        onChange({ startX: drag.startX, startY: drag.startY, endX: end.x, endY: end.y })
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        const end = constrainedEndPoint(event, drag)
        dragRef.current = null
        onChange(Math.hypot(end.x - drag.startX, end.y - drag.startY) < 1 ? null : { startX: drag.startX, startY: drag.startY, endX: end.x, endY: end.y })
      }}
      onPointerCancel={() => { dragRef.current = null }}
    />
  )
}
