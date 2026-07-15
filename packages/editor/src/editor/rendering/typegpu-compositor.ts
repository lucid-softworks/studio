import { common, d, std, type TgpuRoot } from 'typegpu'
import { typeGpuBlendModeCodes, type TypeGpuBlendMode } from './typegpu-blend-modes'

type TypeGpuImageSource = HTMLCanvasElement | HTMLImageElement | HTMLVideoElement | ImageBitmap | ImageData | OffscreenCanvas | VideoFrame

export type TypeGpuFramePresenter = {
  present(source: TypeGpuImageSource): void
  dispose(): void
}

export type TypeGpuLayerCompositor = {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas
  compose(layers: readonly TypeGpuCompositionLayer[]): void
  dispose(): void
}

export type TypeGpuCompositionLayer = {
  source: TypeGpuImageSource
  maskSource?: TypeGpuImageSource
  clipSource?: TypeGpuImageSource
  blendMode: TypeGpuBlendMode
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
  const maskTexture = root.createTexture({
    size: [width, height],
    format: 'rgba8unorm',
  }).$usage('sampled', 'render')
  const maskView = maskTexture.createView(d.texture2d(d.f32))
  const clipTexture = root.createTexture({
    size: [width, height],
    format: 'rgba8unorm',
  }).$usage('sampled', 'render')
  const clipView = clipTexture.createView(d.texture2d(d.f32))
  const compositionTextures = [0, 1].map(() => root.createTexture({
    size: [width, height],
    format: 'rgba8unorm',
  }).$usage('sampled', 'render'))
  const compositionSampleViews = compositionTextures.map((texture) => texture.createView(d.texture2d(d.f32)))
  const compositionRenderViews = compositionTextures.map((texture) => texture.createView('render'))
  const blendMode = root.createUniform(d.u32, typeGpuBlendModeCodes.normal)
  const hasMask = root.createUniform(d.u32, 0)
  const hasClip = root.createUniform(d.u32, 0)
  const sampler = root.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  })
  const createBlendPipeline = (backdropIndex: number) => root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: ({ uv }) => {
      'use gpu'
      const sourceSample = std.textureSample(layerView.$, sampler.$, uv)
      const maskSample = std.textureSample(maskView.$, sampler.$, uv)
      const clipSample = std.textureSample(clipView.$, sampler.$, uv)
      const backdropSample = std.textureSample(compositionSampleViews[backdropIndex].$, sampler.$, uv)
      const source = sourceSample.xyz
      const maskAlpha = std.select(1, maskSample.w, hasMask.$ === 1)
      const clipAlpha = std.select(1, clipSample.w, hasClip.$ === 1)
      const sourceAlpha = std.mul(sourceSample.w, std.mul(maskAlpha, clipAlpha))
      const backdropAlpha = backdropSample.w
      const backdrop = std.div(backdropSample.xyz, std.max(backdropAlpha, 0.00001))
      const one = d.vec3f(1)
      let blended = source

      if (blendMode.$ === typeGpuBlendModeCodes.multiply) blended = std.mul(backdrop, source)
      else if (blendMode.$ === typeGpuBlendModeCodes.screen) blended = std.sub(std.add(backdrop, source), std.mul(backdrop, source))
      else if (blendMode.$ === typeGpuBlendModeCodes.overlay) {
        const low = std.mul(2, std.mul(backdrop, source))
        const high = std.sub(one, std.mul(2, std.mul(std.sub(one, backdrop), std.sub(one, source))))
        blended = std.select(high, low, std.le(backdrop, d.vec3f(0.5)))
      } else if (blendMode.$ === typeGpuBlendModeCodes.darken) blended = std.min(backdrop, source)
      else if (blendMode.$ === typeGpuBlendModeCodes.lighten) blended = std.max(backdrop, source)
      else if (blendMode.$ === typeGpuBlendModeCodes['color-dodge']) {
        const dodge = std.min(one, std.div(backdrop, std.max(std.sub(one, source), d.vec3f(0.00001))))
        blended = std.select(dodge, one, std.ge(source, one))
      } else if (blendMode.$ === typeGpuBlendModeCodes['color-burn']) {
        const burn = std.sub(one, std.min(one, std.div(std.sub(one, backdrop), std.max(source, d.vec3f(0.00001)))))
        blended = std.select(burn, d.vec3f(0), std.le(source, d.vec3f(0)))
      } else if (blendMode.$ === typeGpuBlendModeCodes['hard-light']) {
        const low = std.mul(2, std.mul(backdrop, source))
        const high = std.sub(one, std.mul(2, std.mul(std.sub(one, backdrop), std.sub(one, source))))
        blended = std.select(high, low, std.le(source, d.vec3f(0.5)))
      } else if (blendMode.$ === typeGpuBlendModeCodes['soft-light']) {
        const low = std.sub(backdrop, std.mul(std.sub(one, std.mul(2, source)), std.mul(backdrop, std.sub(one, backdrop))))
        const polynomial = std.mul(std.add(std.mul(std.sub(std.mul(16, backdrop), d.vec3f(12)), backdrop), d.vec3f(4)), backdrop)
        const transfer = std.select(std.sqrt(backdrop), polynomial, std.le(backdrop, d.vec3f(0.25)))
        const high = std.add(backdrop, std.mul(std.sub(std.mul(2, source), one), std.sub(transfer, backdrop)))
        blended = std.select(high, low, std.le(source, d.vec3f(0.5)))
      } else if (blendMode.$ === typeGpuBlendModeCodes.difference) blended = std.abs(std.sub(backdrop, source))
      else if (blendMode.$ === typeGpuBlendModeCodes.exclusion) blended = std.sub(std.add(backdrop, source), std.mul(2, std.mul(backdrop, source)))

      const sourceOnly = std.mul(std.mul(sourceAlpha, std.sub(1, backdropAlpha)), source)
      const blendedOverlap = std.mul(std.mul(sourceAlpha, backdropAlpha), blended)
      const backdropOnly = std.mul(std.sub(1, sourceAlpha), backdropSample.xyz)
      const output = std.add(std.add(sourceOnly, blendedOverlap), backdropOnly)
      const outputAlpha = std.add(sourceAlpha, std.mul(backdropAlpha, std.sub(1, sourceAlpha)))
      return d.vec4f(output, outputAlpha)
    },
  })
  const blendPipelines = [createBlendPipeline(0), createBlendPipeline(1)]
  const presentPipelines = compositionSampleViews.map((view) => root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: ({ uv }) => {
      'use gpu'
      return std.textureSample(view.$, sampler.$, uv)
    },
  }))

  return {
    canvas,
    compose(layers) {
      compositionTextures[0].clear()
      layers.forEach((layer, index) => {
        const backdropIndex = index % 2
        const outputIndex = 1 - backdropIndex
        layerTexture.write(layer.source)
        if (layer.maskSource) maskTexture.write(layer.maskSource)
        if (layer.clipSource) clipTexture.write(layer.clipSource)
        hasMask.write(layer.maskSource ? 1 : 0)
        hasClip.write(layer.clipSource ? 1 : 0)
        blendMode.write(typeGpuBlendModeCodes[layer.blendMode])
        blendPipelines[backdropIndex].withColorAttachment({
          view: compositionRenderViews[outputIndex],
          loadOp: 'clear',
        }).draw(3)
      })
      const finalIndex = layers.length === 0 ? 0 : layers.length % 2
      presentPipelines[finalIndex].withColorAttachment({ view: context, loadOp: 'clear' }).draw(3)
    },
    dispose() {
      layerTexture.destroy()
      maskTexture.destroy()
      clipTexture.destroy()
      compositionTextures.forEach((texture) => texture.destroy())
      blendMode.buffer.destroy()
      hasMask.buffer.destroy()
      hasClip.buffer.destroy()
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
  compositor.compose([{
    source: new ImageData(new Uint8ClampedArray([0, 0, 0, 0]), 1, 1),
    blendMode: 'normal',
  }])
  compositor.dispose()
}
