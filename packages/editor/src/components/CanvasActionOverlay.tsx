import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { Position, ShapeKind } from '../editor/types'
import type { EditorTool } from './ToolRail'

type CanvasActionOverlayProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  tool: EditorTool
  onColorSample: (color: string) => void
  onAddText: (position: Position) => void
  onAddShape: (shape: ShapeKind, position: Position) => void
  onZoom: (direction: 'in' | 'out') => void
}

const actionTools = new Set<EditorTool>(['eyedropper', 'text', 'rectangle', 'ellipse', 'zoom'])

function toHex(value: number) {
  return value.toString(16).padStart(2, '0')
}

export function CanvasActionOverlay({ canvasRef, tool, onColorSample, onAddText, onAddShape, onZoom }: CanvasActionOverlayProps) {
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
    if (tool === 'text') onAddText(normalized)
    else if (tool === 'rectangle' || tool === 'ellipse') onAddShape(tool, normalized)
  }

  return (
    <svg
      aria-label={enabled ? `${tool} tool surface` : undefined}
      viewBox={`0 0 ${canvasRef.current?.width ?? 1600} ${canvasRef.current?.height ?? 1000}`}
      preserveAspectRatio="none"
      className={`absolute inset-0 size-full touch-none ${enabled ? '' : 'pointer-events-none'}`}
      style={{ cursor }}
      onPointerDown={pointerDown}
    />
  )
}
