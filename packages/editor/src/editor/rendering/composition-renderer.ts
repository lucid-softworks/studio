import type { TgpuRoot } from 'typegpu'
import { renderComposition, renderNativeLayerPasses, type RenderCompositionOptions } from '../renderer'
import type { AssetMap } from '../runtime-assets'
import type { EditorDocument } from '../types'
import { getDocumentSize } from '../presets'
import { RenderResourceRegistry } from './render-resource-registry'
import { RenderPassCache } from './render-pass-cache'
import { buildNativeLayerCompositionPlan } from './render-plan'
import { createTypeGpuLayerCompositor, type TypeGpuLayerCompositor } from './typegpu-compositor'

export type CompositionRendererKind = 'canvas2d' | 'webgpu'

export interface CompositionRenderer {
  readonly kind: CompositionRendererKind
  render(
    canvas: HTMLCanvasElement,
    document: EditorDocument,
    assets: AssetMap,
    options?: RenderCompositionOptions,
  ): void
  dispose(): void
}

export type TypeGpuCompositionRendererOptions = {
  maxPassCacheBytes?: number
  maxTextureBytes?: number
}

export const DEFAULT_TYPEGPU_PASS_CACHE_BYTES = 256 * 1024 * 1024
export const DEFAULT_TYPEGPU_TEXTURE_BYTES = 512 * 1024 * 1024
const TYPEGPU_COMPOSITOR_TEXTURES = 8

export function estimateTypeGpuRendererMemory(
  document: EditorDocument,
  options: Pick<RenderCompositionOptions, 'showSelection'> = {},
) {
  const plan = buildNativeLayerCompositionPlan(document)
  if (!plan) return null
  const { width, height } = getDocumentSize(document)
  const clippedPasses = plan.layers.filter((layer) => layer.kind === 'layer' && layer.clipBaseLayerId).length
  const passCount = 1 + plan.layers.length + clippedPasses + (options.showSelection && document.selectedLayerId ? 1 : 0)
  const frameBytes = width * height * 4
  return {
    passCount,
    passCacheBytes: passCount * frameBytes,
    textureBytes: TYPEGPU_COMPOSITOR_TEXTURES * frameBytes,
  }
}

const canvas2dResources = new RenderResourceRegistry()

export const canvas2dCompositionRenderer: CompositionRenderer = {
  kind: 'canvas2d',
  render: (canvas, document, assets, options) => renderComposition(canvas, document, assets, options, canvas2dResources),
  dispose: () => canvas2dResources.dispose(),
}

export function createTypeGpuCompositionRenderer(
  root: TgpuRoot,
  options: TypeGpuCompositionRendererOptions = {},
): CompositionRenderer {
  const resources = new RenderResourceRegistry()
  const passCanvases: HTMLCanvasElement[] = []
  const passCache = new RenderPassCache()
  const maxPassCacheBytes = options.maxPassCacheBytes ?? DEFAULT_TYPEGPU_PASS_CACHE_BYTES
  const maxTextureBytes = options.maxTextureBytes ?? DEFAULT_TYPEGPU_TEXTURE_BYTES
  let compositor: TypeGpuLayerCompositor | null = null
  let compositorSize = { width: 0, height: 0 }

  const releaseNativeResources = () => {
    compositor?.dispose()
    compositor = null
    compositorSize = { width: 0, height: 0 }
    for (const passCanvas of passCanvases) {
      passCanvas.width = 0
      passCanvas.height = 0
    }
    passCanvases.length = 0
    passCache.clear()
  }

  return {
    kind: 'webgpu',
    render(canvas, document, assets, options) {
      const memory = estimateTypeGpuRendererMemory(document, options)
      if (!memory || memory.passCacheBytes > maxPassCacheBytes || memory.textureBytes > maxTextureBytes) {
        releaseNativeResources()
        renderComposition(canvas, document, assets, options, resources)
        return
      }
      const passes = renderNativeLayerPasses(passCanvases, document, assets, resources, options, passCache)
      if (!passes) {
        releaseNativeResources()
        renderComposition(canvas, document, assets, options, resources)
        return
      }
      if (!compositor || compositorSize.width !== passes.width || compositorSize.height !== passes.height) {
        compositor?.dispose()
        compositor = createTypeGpuLayerCompositor(root, passes.width, passes.height)
        compositorSize = { width: passes.width, height: passes.height }
      }
      compositor.compose(passes.layers)
      if (canvas.width !== passes.width) canvas.width = passes.width
      if (canvas.height !== passes.height) canvas.height = passes.height
      const context = canvas.getContext('2d')
      if (!context) return
      context.clearRect(0, 0, passes.width, passes.height)
      context.drawImage(compositor.canvas, 0, 0)
    },
    dispose() {
      releaseNativeResources()
      resources.dispose()
    },
  }
}
