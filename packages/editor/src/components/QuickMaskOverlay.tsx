import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { createSelection, selectionFromMask, type SelectionState } from '../editor/selection'

type Props = { canvasRef: RefObject<HTMLCanvasElement | null>; enabled: boolean; tool: 'brush' | 'eraser'; size: number; selection: SelectionState | null; onChange: (selection: SelectionState) => void }

function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  return { x: (event.clientX - rect.left) / rect.width * event.currentTarget.width, y: (event.clientY - rect.top) / rect.height * event.currentTarget.height }
}

export function QuickMaskOverlay({ canvasRef, enabled, tool, size, selection, onChange }: Props) {
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef<number | null>(null)
  const workingRef = useRef<{ mask: HTMLCanvasElement; revision: number } | null>(null)
  const canvas = canvasRef.current
  const renderOverlay = useCallback(() => {
    const overlay = overlayRef.current
    if (!overlay || !canvas || !enabled) return
    if (overlay.width !== canvas.width) overlay.width = canvas.width
    if (overlay.height !== canvas.height) overlay.height = canvas.height
    const context = overlay.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, overlay.width, overlay.height)
    context.fillStyle = 'rgba(244,63,94,0.42)'
    context.fillRect(0, 0, overlay.width, overlay.height)
    if (selection?.bounds) {
      context.globalCompositeOperation = 'destination-out'
      context.drawImage(selection.mask, 0, 0)
      context.globalCompositeOperation = 'source-over'
    }
  }, [canvas, enabled, selection])
  useEffect(() => {
    renderOverlay()
  }, [renderOverlay])
  const paint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const working = workingRef.current
    const context = working?.mask.getContext('2d')
    if (!working || !context) return
    const position = canvasPoint(event)
    context.save()
    context.globalCompositeOperation = tool === 'brush' ? 'source-over' : 'destination-out'
    context.fillStyle = '#fff'
    context.beginPath()
    context.arc(position.x, position.y, size / 2, 0, Math.PI * 2)
    context.fill()
    context.restore()
    const overlayContext = overlayRef.current?.getContext('2d')
    if (!overlayContext) return
    overlayContext.save()
    overlayContext.globalCompositeOperation = tool === 'brush' ? 'destination-out' : 'source-over'
    overlayContext.fillStyle = 'rgba(244,63,94,0.42)'
    overlayContext.beginPath()
    overlayContext.arc(position.x, position.y, size / 2, 0, Math.PI * 2)
    overlayContext.fill()
    overlayContext.restore()
  }
  return <canvas ref={overlayRef} aria-label="Quick mask painting surface" className={`absolute inset-0 size-full touch-none ${enabled ? 'cursor-crosshair' : 'pointer-events-none opacity-0'}`} onPointerDown={(event) => {
    if (!enabled || !canvas) return
    drawingRef.current = event.pointerId
    const base = selection?.mask.width === canvas.width && selection.mask.height === canvas.height ? selection : createSelection(canvas.width, canvas.height)
    const mask = document.createElement('canvas')
    mask.width = canvas.width
    mask.height = canvas.height
    mask.getContext('2d')?.drawImage(base.mask, 0, 0)
    workingRef.current = { mask, revision: base.revision }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* optional */ }
    paint(event)
  }} onPointerMove={(event) => { if (drawingRef.current === event.pointerId) paint(event) }} onPointerUp={(event) => {
    if (drawingRef.current !== event.pointerId) return
    paint(event)
    const working = workingRef.current
    drawingRef.current = null
    workingRef.current = null
    if (working) onChange(selectionFromMask(working.mask, working.revision + 1))
  }} onPointerCancel={() => {
    drawingRef.current = null
    workingRef.current = null
    renderOverlay()
  }} />
}
