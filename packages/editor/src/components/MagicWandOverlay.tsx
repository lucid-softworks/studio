import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { applySelectionAlphaMask, contiguousAlphaMask, contiguousColorMask, type SelectionMode, type SelectionState } from '../editor/selection'

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  enabled: boolean
  mode: SelectionMode
  tolerance: number
  selection: SelectionState | null
  onChange: (selection: SelectionState | null) => void
  object?: boolean
}

export function MagicWandOverlay({ canvasRef, enabled, mode, tolerance, selection, onChange, object = false }: Props) {
  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d', { willReadFrequently: true })
    if (!enabled || !canvas || !context) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width * canvas.width
    const y = (event.clientY - rect.top) / rect.height * canvas.height
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    onChange(applySelectionAlphaMask(selection, object ? contiguousAlphaMask(image, x, y) : contiguousColorMask(image, x, y, tolerance), mode, canvas.width, canvas.height))
  }

  return (
    <svg
      aria-label={`${object ? 'Object' : 'Magic wand'} selection surface`}
      viewBox={`0 0 ${canvasRef.current?.width ?? 1600} ${canvasRef.current?.height ?? 1000}`}
      preserveAspectRatio="none"
      className={`absolute inset-0 size-full touch-none ${enabled ? 'cursor-crosshair' : 'pointer-events-none'}`}
      onPointerDown={pointerDown}
    />
  )
}
