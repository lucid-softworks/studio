import { renderComposition, type RenderCompositionOptions } from '../renderer'
import type { AssetMap, EditorDocument } from '../types'

export type CompositionRendererKind = 'canvas2d' | 'webgpu'

export interface CompositionRenderer {
  readonly kind: CompositionRendererKind
  render(
    canvas: HTMLCanvasElement,
    document: EditorDocument,
    assets: AssetMap,
    options?: RenderCompositionOptions,
  ): void
}

export const canvas2dCompositionRenderer: CompositionRenderer = {
  kind: 'canvas2d',
  render: renderComposition,
}
