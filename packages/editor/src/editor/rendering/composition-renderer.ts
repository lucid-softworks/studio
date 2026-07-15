import type { TgpuRoot } from 'typegpu'
import { renderComposition, renderNativeLayerPasses, type RenderCompositionOptions } from '../renderer'
import type { AssetMap } from '../runtime-assets'
import type { EditorDocument } from '../types'
import { RenderResourceRegistry } from './render-resource-registry'
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

const canvas2dResources = new RenderResourceRegistry()

export const canvas2dCompositionRenderer: CompositionRenderer = {
  kind: 'canvas2d',
  render: (canvas, document, assets, options) => renderComposition(canvas, document, assets, options, canvas2dResources),
  dispose: () => canvas2dResources.dispose(),
}

export function createTypeGpuCompositionRenderer(root: TgpuRoot): CompositionRenderer {
  const resources = new RenderResourceRegistry()
  const passCanvases: HTMLCanvasElement[] = []
  let compositor: TypeGpuLayerCompositor | null = null
  let compositorSize = { width: 0, height: 0 }

  return {
    kind: 'webgpu',
    render(canvas, document, assets, options) {
      const passes = renderNativeLayerPasses(passCanvases, document, assets, resources, options)
      if (!passes) {
        renderComposition(canvas, document, assets, options, resources)
        return
      }
      if (!compositor || compositorSize.width !== passes.width || compositorSize.height !== passes.height) {
        compositor?.dispose()
        compositor = createTypeGpuLayerCompositor(root, passes.width, passes.height)
        compositorSize = { width: passes.width, height: passes.height }
      }
      compositor.compose(passes.sources)
      if (canvas.width !== passes.width) canvas.width = passes.width
      if (canvas.height !== passes.height) canvas.height = passes.height
      const context = canvas.getContext('2d')
      if (!context) return
      context.clearRect(0, 0, passes.width, passes.height)
      context.drawImage(compositor.canvas, 0, 0)
    },
    dispose() {
      compositor?.dispose()
      compositor = null
      passCanvases.length = 0
      resources.dispose()
    },
  }
}
