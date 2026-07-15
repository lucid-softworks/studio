import { useEffect, useRef } from 'react'
import { canvas2dCompositionRenderer, createTypeGpuCompositionRenderer, type CompositionRenderer } from './rendering/composition-renderer'
import { getTypeGpuRoot } from './rendering/typegpu-runtime'
import type { AssetMap } from './runtime-assets'
import type { EditorDocument } from './types'

export function useCanvasRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  document: EditorDocument,
  assets: AssetMap,
  resourceRevision = 0,
  activeRenderer: 'canvas2d' | 'webgpu' = 'canvas2d',
) {
  const typegpuRenderer = useRef<{ root: NonNullable<ReturnType<typeof getTypeGpuRoot>>; renderer: CompositionRenderer } | null>(null)

  useEffect(() => () => {
    typegpuRenderer.current?.renderer.dispose()
    typegpuRenderer.current = null
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const root = activeRenderer === 'webgpu' ? getTypeGpuRoot() : null
    if (root && typegpuRenderer.current?.root !== root) {
      typegpuRenderer.current?.renderer.dispose()
      typegpuRenderer.current = { root, renderer: createTypeGpuCompositionRenderer(root) }
    }
    const renderer = root ? typegpuRenderer.current?.renderer ?? canvas2dCompositionRenderer : canvas2dCompositionRenderer
    const frame = requestAnimationFrame(() => renderer.render(canvas, document, assets))
    return () => cancelAnimationFrame(frame)
  }, [activeRenderer, assets, canvasRef, document, resourceRevision])
}
