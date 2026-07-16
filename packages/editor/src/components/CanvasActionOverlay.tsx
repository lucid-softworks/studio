import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { Position, ShapeKind } from '../editor/types'
import type { EditorTool } from './ToolRail'

type CanvasActionOverlayProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  tool: EditorTool
  onColorSample: (color: string) => void
  onAddText: (position: Position, paragraphBox?: { width: number; height: number }) => void
  onAddShape: (shape: ShapeKind, position: Position) => void
  onZoom: (direction: 'in' | 'out') => void
}

const actionTools = new Set<EditorTool>(['eyedropper', 'text', 'rectangle', 'ellipse', 'zoom'])

function toHex(value: number) {
  return value.toString(16).padStart(2, '0')
}

export function CanvasActionOverlay({ canvasRef, tool, onColorSample, onAddText, onAddShape, onZoom }: CanvasActionOverlayProps) {
  const textStartRef = useRef<Position | null>(null)
  const enabled = actionTools.has(tool)
  const cursor = tool === 'text' ? 'text' : tool === 'zoom' ? 'zoom-in' : 'crosshair'

  const point = (event: ReactPointerEvent<SVGSVGElement>) => {
    const canvas = canvasRef.current
    const rect = event.currentTarget.getBoundingClientRect()
    if (!canvas || rect.width === 0 || rect.height === 0) return null
    return {
      x: (event.clientX - rect.left) / rect.width * canvas.width,
      y: (event.clientY - rect.top) / rect.height * canvas.height,
    }
  }

  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!enabled) return
    const canvas = canvasRef.current
    const position = point(event)
    if (!canvas || !position) return
    event.preventDefault()

    if (tool === 'eyedropper') {
      const pixel = canvas.getContext('2d', { willReadFrequently: true })?.getImageData(
        Math.max(0, Math.min(canvas.width - 1, Math.floor(position.x))),
        Math.max(0, Math.min(canvas.height - 1, Math.floor(position.y))),
        1,
        1,
      ).data
      if (pixel && pixel[3] > 0) onColorSample(`#${toHex(pixel[0])}${toHex(pixel[1])}${toHex(pixel[2])}`)
      return
    }

    if (tool === 'zoom') {
      onZoom(event.altKey ? 'out' : 'in')
      return
    }

    const normalized = { x: position.x / canvas.width - 0.5, y: position.y / canvas.height - 0.5 }
    if (tool === 'text') {
      textStartRef.current = position
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    else if (tool === 'rectangle' || tool === 'ellipse') onAddShape(tool, normalized)
  }

  const pointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const canvas = canvasRef.current
    const start = textStartRef.current
    const end = point(event)
    textStartRef.current = null
    if (tool !== 'text' || !canvas || !start || !end) return
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)
    const paragraphBox = width >= 24 && height >= 24 ? { width, height } : undefined
    const center = paragraphBox ? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } : start
    onAddText({ x: center.x / canvas.width - 0.5, y: center.y / canvas.height - 0.5 }, paragraphBox)
  }

  return (
    <svg
      aria-label={enabled ? `${tool} tool surface` : undefined}
      viewBox={`0 0 ${canvasRef.current?.width ?? 1600} ${canvasRef.current?.height ?? 1000}`}
      preserveAspectRatio="none"
      className={`absolute inset-0 size-full touch-none ${enabled ? '' : 'pointer-events-none'}`}
      style={{ cursor }}
      onPointerDown={pointerDown}
      onPointerUp={pointerUp}
      onPointerCancel={() => { textStartRef.current = null }}
    />
  )
}
