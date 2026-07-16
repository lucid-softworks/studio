import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { applySelectionAlphaMask, type SelectionMode, type SelectionState } from '../editor/selection'

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
  const workerRef = useRef<Worker | null>(null)
  const requestRef = useRef(0)
  const [busy, setBusy] = useState(false)
  const cancel = () => {
    workerRef.current?.terminate()
    workerRef.current = null
    requestRef.current += 1
    setBusy(false)
  }

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    window.addEventListener('keydown', keyDown)
    return () => { window.removeEventListener('keydown', keyDown); workerRef.current?.terminate() }
  }, [])

  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d', { willReadFrequently: true })
    if (!enabled || !canvas || !context) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width * canvas.width
    const y = (event.clientY - rect.top) / rect.height * canvas.height
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    cancel()
    const id = requestRef.current
    const worker = new Worker(new URL('../editor/workers/raster-ops.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    setBusy(true)
    worker.onmessage = (message: MessageEvent<{ id: number; mask?: ArrayBuffer; error?: string }>) => {
      if (message.data.id !== id || workerRef.current !== worker) return
      worker.terminate()
      workerRef.current = null
      setBusy(false)
      if (message.data.mask) onChange(applySelectionAlphaMask(selection, new Uint8ClampedArray(message.data.mask), mode, canvas.width, canvas.height))
    }
    worker.onerror = () => { if (workerRef.current === worker) { workerRef.current = null; setBusy(false) }; worker.terminate() }
    worker.postMessage({ id, operation: object ? 'contiguous-alpha' : 'contiguous-color', data: image.data.buffer, width: image.width, height: image.height, x, y, tolerance: object ? 8 : tolerance }, [image.data.buffer])
  }

  return (
    <svg
      aria-label={`${object ? 'Object' : 'Magic wand'} selection surface`}
      aria-busy={busy}
      viewBox={`0 0 ${canvasRef.current?.width ?? 1600} ${canvasRef.current?.height ?? 1000}`}
      preserveAspectRatio="none"
      className={`absolute inset-0 size-full touch-none ${enabled ? busy ? 'cursor-progress' : 'cursor-crosshair' : 'pointer-events-none'}`}
      onPointerDown={pointerDown}
    />
  )
}
