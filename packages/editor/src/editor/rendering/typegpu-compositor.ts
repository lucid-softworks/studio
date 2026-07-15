import { common, d, std, type TgpuRoot } from 'typegpu'

type TypeGpuImageSource = HTMLCanvasElement | HTMLImageElement | HTMLVideoElement | ImageBitmap | ImageData | OffscreenCanvas | VideoFrame

export type TypeGpuFramePresenter = {
  present(source: TypeGpuImageSource): void
  dispose(): void
}

export type TypeGpuLayerCompositor = {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas
  compose(sources: readonly TypeGpuImageSource[]): void
  dispose(): void
}

export function createTypeGpuFramePresenter(
  root: TgpuRoot,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  width: number,
  height: number,
): TypeGpuFramePresenter {
  canvas.width = width
  canvas.height = height
  const context = root.configureContext({ canvas, alphaMode: 'premultiplied' })
  const frameTexture = root.createTexture({
    size: [width, height],
    format: 'rgba8unorm',
  }).$usage('sampled', 'render')
  const frameView = frameTexture.createView(d.texture2d(d.f32))
  const sampler = root.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  })
  const pipeline = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: ({ uv }) => {
      'use gpu'
      return std.textureSample(frameView.$, sampler.$, uv)
    },
  })

  return {
    present(source) {
      frameTexture.write(source)
      pipeline.withColorAttachment({ view: context }).draw(3)
    },
    dispose() {
      frameTexture.destroy()
    },
  }
}

export function createTypeGpuLayerCompositor(
  root: TgpuRoot,
  width: number,
  height: number,
): TypeGpuLayerCompositor {
  const canvas = typeof OffscreenCanvas === 'undefined'
    ? document.createElement('canvas')
    : new OffscreenCanvas(width, height)
  canvas.width = width
  canvas.height = height
  const context = root.configureContext({ canvas, alphaMode: 'premultiplied' })
  const layerTexture = root.createTexture({
    size: [width, height],
    format: 'rgba8unorm',
  }).$usage('sampled', 'render')
  const layerView = layerTexture.createView(d.texture2d(d.f32))
  const sampler = root.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  })
  const pipeline = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: ({ uv }) => {
      'use gpu'
      return std.textureSample(layerView.$, sampler.$, uv)
    },
    targets: {
      blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      },
    },
  })

  return {
    canvas,
    compose(sources) {
      if (sources.length === 0) {
        pipeline.withColorAttachment({ view: context, loadOp: 'clear' }).draw(3)
        return
      }
      sources.forEach((source, index) => {
        layerTexture.write(source)
        pipeline.withColorAttachment({
          view: context,
          loadOp: index === 0 ? 'clear' : 'load',
        }).draw(3)
      })
    },
    dispose() {
      layerTexture.destroy()
    },
  }
}

export function validateTypeGpuCompositor(root: TgpuRoot) {
  const canvas = typeof OffscreenCanvas === 'undefined'
    ? document.createElement('canvas')
    : new OffscreenCanvas(1, 1)
  const presenter = createTypeGpuFramePresenter(root, canvas, 1, 1)
  presenter.present(new ImageData(new Uint8ClampedArray([0, 0, 0, 0]), 1, 1))
  presenter.dispose()
  const compositor = createTypeGpuLayerCompositor(root, 1, 1)
  compositor.compose([new ImageData(new Uint8ClampedArray([0, 0, 0, 0]), 1, 1)])
  compositor.dispose()
}
