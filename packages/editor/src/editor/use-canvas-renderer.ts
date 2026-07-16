import { useCallback, useEffect, useRef } from 'react'
import { canvas2dCompositionRenderer, createTypeGpuCompositionRenderer, type CompositionRenderer } from './rendering/composition-renderer'
import { getTypeGpuRoot } from './rendering/typegpu-runtime'
import { supportsWorkerComposition, type WorkerCompositionRequest, type WorkerCompositionResponse } from './rendering/worker-composition'
import type { AssetMap } from './runtime-assets'
import type { EditorDocument } from './types'
import type { EditorPerformanceMetrics } from './performance-metrics'

export function useCanvasRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  document: EditorDocument,
  assets: AssetMap,
  resourceRevision = 0,
  activeRenderer: 'canvas2d' | 'webgpu' = 'canvas2d',
  performanceMetrics?: EditorPerformanceMetrics,
) {
  const typegpuRenderer = useRef<{ root: NonNullable<ReturnType<typeof getTypeGpuRoot>>; renderer: CompositionRenderer } | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const workerFailedRef = useRef(false)
  const renderSuspendedRef = useRef(false)
  const requestRef = useRef(0)
  const renderStartedRef = useRef(new Map<number, number>())
  const latestFrameRef = useRef({ document, assets })
  useEffect(() => { latestFrameRef.current = { document, assets } }, [assets, document])

  const markRendered = useCallback((canvas: HTMLCanvasElement, requestId: number) => {
    const startedAt = renderStartedRef.current.get(requestId)
    if (startedAt !== undefined) {
      performanceMetrics?.recordRender(performance.now() - startedAt)
      renderStartedRef.current.delete(requestId)
    } else performanceMetrics?.recordRender()
    canvas.dataset.renderRevision = String(requestId)
    canvas.dispatchEvent(new CustomEvent('studio:canvas-rendered', { detail: { requestId } }))
  }, [performanceMetrics])

  const workerRenderer = useCallback(() => {
    if (workerRef.current || workerFailedRef.current) return workerRef.current
    const worker = new Worker(new URL('./workers/composition.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerCompositionResponse>) => {
      const response = event.data
      if (response.id !== requestRef.current || renderSuspendedRef.current) {
        renderStartedRef.current.delete(response.id)
        response.frame.close()
        return
      }
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) {
        response.frame.close()
        return
      }
      if (canvas.width !== response.width) canvas.width = response.width
      if (canvas.height !== response.height) canvas.height = response.height
      context.clearRect(0, 0, response.width, response.height)
      context.drawImage(response.frame, 0, 0)
      response.frame.close()
      markRendered(canvas, response.id)
    }
    worker.onerror = () => {
      workerFailedRef.current = true
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
      const canvas = canvasRef.current
      if (canvas && !renderSuspendedRef.current) {
        canvas2dCompositionRenderer.render(canvas, latestFrameRef.current.document, latestFrameRef.current.assets)
        markRendered(canvas, requestRef.current)
      }
    }
    workerRef.current = worker
    return worker
  }, [canvasRef, markRendered])

  useEffect(() => () => {
    typegpuRenderer.current?.renderer.dispose()
    typegpuRenderer.current = null
    workerRef.current?.terminate()
    workerRef.current = null
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const suspend = () => {
      renderSuspendedRef.current = true
      requestRef.current += 1
      renderStartedRef.current.clear()
    }
    const resume = () => { renderSuspendedRef.current = false }
    canvas.addEventListener('studio:transform-preview-start', suspend)
    canvas.addEventListener('studio:transform-preview-end', resume)
    return () => {
      canvas.removeEventListener('studio:transform-preview-start', suspend)
      canvas.removeEventListener('studio:transform-preview-end', resume)
    }
  }, [canvasRef])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderStarts = renderStartedRef.current
    const root = activeRenderer === 'webgpu' ? getTypeGpuRoot() : null
    if (root && typegpuRenderer.current?.root !== root) {
      typegpuRenderer.current?.renderer.dispose()
      typegpuRenderer.current = { root, renderer: createTypeGpuCompositionRenderer(root) }
    }
    const renderer = root ? typegpuRenderer.current?.renderer ?? canvas2dCompositionRenderer : canvas2dCompositionRenderer
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    renderStarts.set(requestId, performance.now())
    let cancelled = false
    const frame = requestAnimationFrame(() => {
      if (cancelled || requestId !== requestRef.current || renderSuspendedRef.current) return
      const supportsWorker = !root
        && !workerFailedRef.current
        && typeof Worker !== 'undefined'
        && typeof OffscreenCanvas !== 'undefined'
        && typeof createImageBitmap !== 'undefined'
        && supportsWorkerComposition(document)
      if (!supportsWorker) {
        renderer.render(canvas, document, assets)
        markRendered(canvas, requestId)
        return
      }
      void Promise.all(Object.entries(assets).map(async ([id, asset]) => ({
        id,
        name: asset.name,
        revision: asset.revision ?? 0,
        bitmap: await createImageBitmap(asset.surface ?? asset.element),
      }))).then((workerAssets) => {
        if (cancelled || requestId !== requestRef.current || renderSuspendedRef.current) {
          workerAssets.forEach((asset) => asset.bitmap.close())
          return
        }
        const worker = workerRenderer()
        if (!worker) {
          workerAssets.forEach((asset) => asset.bitmap.close())
          renderer.render(canvas, document, assets)
          markRendered(canvas, requestId)
          return
        }
        const request: WorkerCompositionRequest = { id: requestId, document, assets: workerAssets }
        worker.postMessage(request, workerAssets.map((asset) => asset.bitmap))
      }).catch(() => {
        if (!cancelled && requestId === requestRef.current && !renderSuspendedRef.current) { renderer.render(canvas, document, assets); markRendered(canvas, requestId) }
      })
    })
    return () => {
      cancelled = true
      renderStarts.delete(requestId)
      cancelAnimationFrame(frame)
    }
  }, [activeRenderer, assets, canvasRef, document, markRendered, performanceMetrics, resourceRevision, workerRenderer])
}
