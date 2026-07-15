import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { applySelectionShape, type SelectionMode, type SelectionShape, type SelectionState } from '../editor/selection'

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  enabled: boolean
  kind: 'rectangle' | 'ellipse'
  mode: SelectionMode
  selection: SelectionState | null
  onChange: (selection: SelectionState | null) => void
}

type Drag = { pointerId: number; startX: number; startY: number }

export function SelectionOverlay({ canvasRef, enabled, kind, mode, selection, onChange }: Props) {
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [preview, setPreview] = useState<SelectionShape | null>(null)
  const canvas = canvasRef.current

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay || !canvas) return
    if (overlay.width !== canvas.width) overlay.width = canvas.width
    if (overlay.height !== canvas.height) overlay.height = canvas.height
    const context = overlay.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, overlay.width, overlay.height)

    if (selection?.bounds) {
      context.save()
      context.drawImage(selection.mask, 0, 0)
      context.globalCompositeOperation = 'source-in'
      context.fillStyle = 'rgba(139,92,246,0.18)'
      context.fillRect(0, 0, overlay.width, overlay.height)
      context.restore()
      const lineWidth = Math.max(2, overlay.width / 700)
      context.lineWidth = lineWidth
      context.strokeStyle = '#ffffff'
      context.setLineDash([12, 8])
      context.strokeRect(selection.bounds.x, selection.bounds.y, selection.bounds.width, selection.bounds.height)
      context.lineDashOffset = 10
      context.strokeStyle = '#18181b'
      context.strokeRect(selection.bounds.x, selection.bounds.y, selection.bounds.width, selection.bounds.height)
      context.setLineDash([])
    }

    if (preview) {
      context.save()
      context.strokeStyle = '#c4b5fd'
      context.lineWidth = Math.max(2, overlay.width / 600)
      context.setLineDash([14, 9])
      context.beginPath()
      if (preview.kind === 'ellipse') context.ellipse(preview.x + preview.width / 2, preview.y + preview.height / 2, Math.abs(preview.width / 2), Math.abs(preview.height / 2), 0, 0, Math.PI * 2)
      else context.rect(preview.x, preview.y, preview.width, preview.height)
      context.stroke()
      context.restore()
    }
  }, [canvas, preview, selection])

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / rect.width * event.currentTarget.width, y: (event.clientY - rect.top) / rect.height * event.currentTarget.height }
  }

  const shapeFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>, drag: Drag): SelectionShape => {
    const end = point(event)
    let dx = end.x - drag.startX
    let dy = end.y - drag.startY
    if (event.shiftKey) {
      const size = Math.max(Math.abs(dx), Math.abs(dy))
      dx = Math.sign(dx || 1) * size
      dy = Math.sign(dy || 1) * size
    }
    if (event.altKey) return { kind, x: drag.startX - Math.abs(dx), y: drag.startY - Math.abs(dy), width: Math.abs(dx) * 2, height: Math.abs(dy) * 2 }
    return { kind, x: Math.min(drag.startX, drag.startX + dx), y: Math.min(drag.startY, drag.startY + dy), width: Math.abs(dx), height: Math.abs(dy) }
  }

  return (
    <canvas
      ref={overlayRef}
      aria-label={`${kind === 'rectangle' ? 'Rectangular' : 'Elliptical'} selection surface`}
      className={`absolute inset-0 size-full touch-none ${enabled ? 'cursor-crosshair' : 'pointer-events-none'}`}
      onPointerDown={(event) => {
        if (!enabled) return
        const start = point(event)
        dragRef.current = { pointerId: event.pointerId, startX: start.x, startY: start.y }
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Synthetic events do not expose capture. */ }
        setPreview({ kind, x: start.x, y: start.y, width: 0, height: 0 })
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (drag?.pointerId === event.pointerId) setPreview(shapeFromEvent(event, drag))
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId || !canvas) return
        const shape = shapeFromEvent(event, drag)
        dragRef.current = null
        setPreview(null)
        if (shape.width >= 1 && shape.height >= 1) onChange(applySelectionShape(selection, shape, mode, canvas.width, canvas.height))
      }}
      onPointerCancel={() => { dragRef.current = null; setPreview(null) }}
    />
  )
}
