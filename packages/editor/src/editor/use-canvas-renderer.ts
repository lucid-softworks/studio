import { useEffect } from 'react'
import { canvas2dCompositionRenderer } from './rendering/composition-renderer'
import type { AssetMap } from './runtime-assets'
import type { EditorDocument } from './types'

export function useCanvasRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  document: EditorDocument,
  assets: AssetMap,
  resourceRevision = 0,
) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const frame = requestAnimationFrame(() => canvas2dCompositionRenderer.render(canvas, document, assets))
    return () => cancelAnimationFrame(frame)
  }, [assets, canvasRef, document, resourceRevision])
}
