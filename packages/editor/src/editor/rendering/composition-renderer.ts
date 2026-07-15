import { renderComposition, type RenderCompositionOptions } from '../renderer'
import type { AssetMap } from '../runtime-assets'
import type { EditorDocument } from '../types'
import { RenderResourceRegistry } from './render-resource-registry'

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
