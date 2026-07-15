import { useEffect } from 'react'
import { renderComposition } from './renderer'
import type { AssetMap, EditorDocument } from './types'

export function useCanvasRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  document: EditorDocument,
  assets: AssetMap,
) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const frame = requestAnimationFrame(() => renderComposition(canvas, document, assets))
    return () => cancelAnimationFrame(frame)
  }, [assets, canvasRef, document])
}
