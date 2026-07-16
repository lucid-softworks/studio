import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { applySingleMarquee, type SelectionMode, type SelectionState } from '../editor/selection'

type Props = { canvasRef: RefObject<HTMLCanvasElement | null>; enabled: boolean; kind: 'row' | 'column'; mode: SelectionMode; selection: SelectionState | null; onChange: (selection: SelectionState | null) => void }

export function SingleMarqueeOverlay({ canvasRef, enabled, kind, mode, selection, onChange }: Props) {
  const select = (event: ReactPointerEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current
    if (!enabled || !canvas) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width * canvas.width
    const y = (event.clientY - rect.top) / rect.height * canvas.height
    const effectiveMode = event.shiftKey && event.altKey ? 'intersect' : event.shiftKey ? 'add' : event.altKey ? 'subtract' : mode
    const next = applySingleMarquee(selection, kind, kind === 'row' ? y : x, effectiveMode, canvas.width, canvas.height)
    onChange(next.bounds ? next : null)
  }
  return <div aria-label={`Single ${kind} marquee surface`} data-selection-width={selection?.bounds?.width} data-selection-height={selection?.bounds?.height} onPointerDown={select} className={`absolute inset-0 touch-none ${enabled ? 'cursor-crosshair' : 'pointer-events-none'}`} />
}
