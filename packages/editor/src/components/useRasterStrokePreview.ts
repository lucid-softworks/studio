import { useEffect, useRef, type RefObject } from 'react'
import { layerFilterCss } from '../editor/filters'
import { rasterBounds } from '../editor/renderer'
import { canvas2dCompositionRenderer } from '../editor/rendering/composition-renderer'
import type { AssetMap } from '../editor/runtime-assets'
import type { EditorDocument, RasterLayer } from '../editor/types'

type Options = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  document: EditorDocument
  assets: AssetMap
  layer?: RasterLayer
  surface?: HTMLCanvasElement
  imageSmoothingEnabled?: boolean
}

export function useRasterStrokePreview({ canvasRef, document, assets, layer, surface, imageSmoothingEnabled = true }: Options) {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const frameRef = useRef(0)
  const activeRef = useRef(false)
  const canvas = canvasRef.current

  const hidePreview = () => {
    const preview = previewCanvasRef.current
    if (!preview) return
    preview.style.display = 'none'
    preview.style.mixBlendMode = 'normal'
    preview.width = 1
    preview.height = 1
  }

  const cancelScheduledPreview = () => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = 0
  }

  const drawPreview = () => {
    const preview = previewCanvasRef.current
    if (!canvas || !preview || !surface || !layer) return
    if (preview.width !== canvas.width) preview.width = canvas.width
    if (preview.height !== canvas.height) preview.height = canvas.height
    const context = preview.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, preview.width, preview.height)
    const bounds = rasterBounds(canvas, layer)
    context.save()
    context.globalAlpha = layer.opacity / 100
    context.filter = layerFilterCss(layer.filters)
    context.imageSmoothingEnabled = imageSmoothingEnabled
    context.translate(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    context.rotate(bounds.rotation * Math.PI / 180)
    context.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1)
    context.drawImage(surface, -bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height)
    context.restore()
    preview.style.mixBlendMode = layer.blendMode ?? 'normal'
    preview.style.display = 'block'
  }

  const beginPreview = () => {
    if (!canvas || !layer) return
    cleanupRef.current?.()
    activeRef.current = true
    canvas.dispatchEvent(new CustomEvent('studio:transform-preview-start'))
    const baseDocument: EditorDocument = {
      ...document,
      layers: document.layers.map((candidate) => candidate.id === layer.id ? { ...candidate, visible: false } : candidate),
      selectedLayerId: null,
      selectedLayerIds: [],
      selectedGroupId: null,
    }
    canvas2dCompositionRenderer.render(canvas, baseDocument, assets)
    drawPreview()
  }

  const schedulePreview = () => {
    if (frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      if (activeRef.current) drawPreview()
    })
  }

  const finishPreview = () => {
    if (!canvas) return
    activeRef.current = false
    canvas.dispatchEvent(new CustomEvent('studio:transform-preview-end'))
    const cleanup = () => {
      canvas.removeEventListener('studio:canvas-rendered', rendered)
      window.clearTimeout(timeout)
      hidePreview()
      cleanupRef.current = null
    }
    const rendered = () => cleanup()
    const timeout = window.setTimeout(cleanup, 2_000)
    canvas.addEventListener('studio:canvas-rendered', rendered, { once: true })
    cleanupRef.current = cleanup
  }

  const cancelPreview = () => {
    cancelScheduledPreview()
    activeRef.current = false
    if (canvas) {
      canvas2dCompositionRenderer.render(canvas, document, assets)
      canvas.dispatchEvent(new CustomEvent('studio:transform-preview-end'))
    }
    hidePreview()
    cleanupRef.current?.()
  }

  useEffect(() => () => {
    cancelScheduledPreview()
    if (activeRef.current) canvasRef.current?.dispatchEvent(new CustomEvent('studio:transform-preview-end'))
    cleanupRef.current?.()
  }, [canvasRef])

  return {
    previewCanvasRef,
    beginPreview,
    drawPreview,
    schedulePreview,
    finishPreview,
    cancelPreview,
    cancelScheduledPreview,
  }
}
