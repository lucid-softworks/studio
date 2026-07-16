import { common, d, std, tgpu, type TgpuRoot } from 'typegpu'
import { typeGpuBlendModeCodes, type TypeGpuBlendMode } from './typegpu-blend-modes'
import type { FilterGraphNode } from '../types'

type TypeGpuImageSource = HTMLCanvasElement | HTMLImageElement | HTMLVideoElement | ImageBitmap | ImageData | OffscreenCanvas | VideoFrame

const gpuLuminosity = tgpu.fn([d.vec3f], d.f32)((color) => {
  'use gpu'
  return std.dot(color, d.vec3f(0.3, 0.59, 0.11))
})

const gpuSaturation = tgpu.fn([d.vec3f], d.f32)((color) => {
  'use gpu'
  return std.sub(std.max(color.x, color.y, color.z), std.min(color.x, color.y, color.z))
})

const gpuClipColor = tgpu.fn([d.vec3f], d.vec3f)((color) => {
  'use gpu'
  const lightness = gpuLuminosity(color)
  const minimum = std.min(color.x, color.y, color.z)
  const maximum = std.max(color.x, color.y, color.z)
  const low = std.add(lightness, std.div(
    std.mul(std.sub(color, lightness), lightness),
    std.max(std.sub(lightness, minimum), 0.00001),
  ))
  const lowClipped = std.select(color, low, minimum < 0)
  const high = std.add(lightness, std.div(
    std.mul(std.sub(lowClipped, lightness), std.sub(1, lightness)),
    std.max(std.sub(maximum, lightness), 0.00001),
  ))
  return std.select(lowClipped, high, maximum > 1)
})

const gpuSetLuminosity = tgpu.fn([d.vec3f, d.f32], d.vec3f)((color, lightness) => {
  'use gpu'
  return gpuClipColor(std.add(color, std.sub(lightness, gpuLuminosity(color))))
})

const gpuSetSaturation = tgpu.fn([d.vec3f, d.f32], d.vec3f)((color, value) => {
  'use gpu'
  const minimum = std.min(color.x, color.y, color.z)
  const range = std.sub(std.max(color.x, color.y, color.z), minimum)
  const scaled = std.div(std.mul(std.sub(color, minimum), value), std.max(range, 0.00001))
  return std.select(d.vec3f(0), scaled, range > 0)
})

export const gpuApplyAdjustment = tgpu.fn(
  [d.vec3f, d.f32, d.f32, d.f32, d.f32],
  d.vec3f,
)((color, brightness, contrast, saturation, hue) => {
  'use gpu'
  let adjusted = std.mul(color, brightness)
  adjusted = std.add(std.mul(std.sub(adjusted, d.vec3f(0.5)), contrast), d.vec3f(0.5))
  const luminance = std.dot(adjusted, d.vec3f(0.213, 0.715, 0.072))
  adjusted = std.add(d.vec3f(luminance), std.mul(std.sub(adjusted, d.vec3f(luminance)), saturation))

  const cosine = std.cos(hue)
  const sine = std.sin(hue)
  const red = std.dot(adjusted, d.vec3f(
    std.add(0.213, std.sub(std.mul(0.787, cosine), std.mul(0.213, sine))),
    std.sub(0.715, std.add(std.mul(0.715, cosine), std.mul(0.715, sine))),
    std.add(0.072, std.add(std.mul(-0.072, cosine), std.mul(0.928, sine))),
  ))
  const green = std.dot(adjusted, d.vec3f(
    std.add(0.213, std.add(std.mul(-0.213, cosine), std.mul(0.143, sine))),
    std.add(0.715, std.add(std.mul(0.285, cosine), std.mul(0.14, sine))),
    std.add(0.072, std.add(std.mul(-0.072, cosine), std.mul(-0.283, sine))),
  ))
  const blue = std.dot(adjusted, d.vec3f(
    std.add(0.213, std.add(std.mul(-0.213, cosine), std.mul(-0.787, sine))),
    std.add(0.715, std.add(std.mul(-0.715, cosine), std.mul(0.715, sine))),
    std.add(0.072, std.add(std.mul(0.928, cosine), std.mul(0.072, sine))),
  ))
  return std.clamp(d.vec3f(red, green, blue), d.vec3f(0), d.vec3f(1))
})

export const gpuApplyLayerFilters = tgpu.fn(
  [d.vec3f, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32],
  d.vec3f,
)((color, brightness, contrast, saturation, hue, grayscale, sepia, invert) => {
  'use gpu'
  let filtered = gpuApplyAdjustment(color, brightness, contrast, saturation, hue)
  const luminance = std.dot(filtered, d.vec3f(0.2126, 0.7152, 0.0722))
  filtered = std.mix(filtered, d.vec3f(luminance), grayscale)
  const sepiaColor = d.vec3f(
    std.dot(filtered, d.vec3f(0.393, 0.769, 0.189)),
    std.dot(filtered, d.vec3f(0.349, 0.686, 0.168)),
    std.dot(filtered, d.vec3f(0.272, 0.534, 0.131)),
  )
  filtered = std.mix(filtered, sepiaColor, sepia)
  filtered = std.mix(filtered, std.sub(d.vec3f(1), filtered), invert)
  return std.clamp(filtered, d.vec3f(0), d.vec3f(1))
})

export const gpuTintEffect = tgpu.fn(
  [d.f32, d.vec3f, d.f32],
  d.vec4f,
)((sourceAlpha, color, opacity) => {
  'use gpu'
  return d.vec4f(color, std.mul(sourceAlpha, opacity))
})

const gpuProceduralNoise = tgpu.fn([d.vec2f, d.f32], d.f32)((position, seed) => {
  'use gpu'
  return std.fract(std.mul(std.sin(std.add(std.dot(position, d.vec2f(12.9898, 78.233)), seed)), 43758.5453))
})

export function calculateEffectOffset(angle: number, distance: number, width: number, height: number) {
  const radians = angle * Math.PI / 180
  return {
    x: Math.cos(radians) * distance / width,
    y: Math.sin(radians) * distance / height,
  }
}

export const gpuCompositePixel = tgpu.fn(
  [d.vec4f, d.vec3f, d.f32, d.u32],
  d.vec4f,
)((backdropSample, source, sourceAlpha, mode) => {
  'use gpu'
  const backdropAlpha = backdropSample.w
  const backdrop = std.div(backdropSample.xyz, std.max(backdropAlpha, 0.00001))
  const one = d.vec3f(1)
  let blended = source

  if (mode === typeGpuBlendModeCodes.multiply) blended = std.mul(backdrop, source)
  else if (mode === typeGpuBlendModeCodes.screen) blended = std.sub(std.add(backdrop, source), std.mul(backdrop, source))
  else if (mode === typeGpuBlendModeCodes.overlay) {
    const low = std.mul(2, std.mul(backdrop, source))
    const high = std.sub(one, std.mul(2, std.mul(std.sub(one, backdrop), std.sub(one, source))))
    blended = std.select(high, low, std.le(backdrop, d.vec3f(0.5)))
  } else if (mode === typeGpuBlendModeCodes.darken) blended = std.min(backdrop, source)
  else if (mode === typeGpuBlendModeCodes.lighten) blended = std.max(backdrop, source)
  else if (mode === typeGpuBlendModeCodes['color-dodge']) {
    const dodge = std.min(one, std.div(backdrop, std.max(std.sub(one, source), d.vec3f(0.00001))))
    blended = std.select(dodge, one, std.ge(source, one))
  } else if (mode === typeGpuBlendModeCodes['color-burn']) {
    const burn = std.sub(one, std.min(one, std.div(std.sub(one, backdrop), std.max(source, d.vec3f(0.00001)))))
    blended = std.select(burn, d.vec3f(0), std.le(source, d.vec3f(0)))
  } else if (mode === typeGpuBlendModeCodes['hard-light']) {
    const low = std.mul(2, std.mul(backdrop, source))
    const high = std.sub(one, std.mul(2, std.mul(std.sub(one, backdrop), std.sub(one, source))))
    blended = std.select(high, low, std.le(source, d.vec3f(0.5)))
  } else if (mode === typeGpuBlendModeCodes['soft-light']) {
    const low = std.sub(backdrop, std.mul(std.sub(one, std.mul(2, source)), std.mul(backdrop, std.sub(one, backdrop))))
    const polynomial = std.mul(std.add(std.mul(std.sub(std.mul(16, backdrop), d.vec3f(12)), backdrop), d.vec3f(4)), backdrop)
    const transfer = std.select(std.sqrt(backdrop), polynomial, std.le(backdrop, d.vec3f(0.25)))
    const high = std.add(backdrop, std.mul(std.sub(std.mul(2, source), one), std.sub(transfer, backdrop)))
    blended = std.select(high, low, std.le(source, d.vec3f(0.5)))
  } else if (mode === typeGpuBlendModeCodes.difference) blended = std.abs(std.sub(backdrop, source))
  else if (mode === typeGpuBlendModeCodes.exclusion) blended = std.sub(std.add(backdrop, source), std.mul(2, std.mul(backdrop, source)))
  else if (mode === typeGpuBlendModeCodes.hue) blended = gpuSetLuminosity(gpuSetSaturation(source, gpuSaturation(backdrop)), gpuLuminosity(backdrop))
  else if (mode === typeGpuBlendModeCodes.saturation) blended = gpuSetLuminosity(gpuSetSaturation(backdrop, gpuSaturation(source)), gpuLuminosity(backdrop))
  else if (mode === typeGpuBlendModeCodes.color) blended = gpuSetLuminosity(source, gpuLuminosity(backdrop))
  else if (mode === typeGpuBlendModeCodes.luminosity) blended = gpuSetLuminosity(backdrop, gpuLuminosity(source))

  const sourceOnly = std.mul(std.mul(sourceAlpha, std.sub(1, backdropAlpha)), source)
  const blendedOverlap = std.mul(std.mul(sourceAlpha, backdropAlpha), blended)
  const backdropOnly = std.mul(std.sub(1, sourceAlpha), backdropSample.xyz)
  const output = std.add(std.add(sourceOnly, blendedOverlap), backdropOnly)
  const outputAlpha = std.add(sourceAlpha, std.mul(backdropAlpha, std.sub(1, sourceAlpha)))
  return d.vec4f(output, outputAlpha)
})

export type TypeGpuFramePresenter = {
  present(source: TypeGpuImageSource): void
  dispose(): void
}

export type TypeGpuLayerCompositor = {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas
  compose(layers: readonly TypeGpuCompositionLayer[]): void
  dispose(): void
}

export type TypeGpuCompositionTextureLayer = {
  kind: 'layer'
  source: TypeGpuImageSource
  maskSource?: TypeGpuImageSource
  clipSource?: TypeGpuImageSource
  blendMode: TypeGpuBlendMode
  opacity?: number
  filters?: {
    brightness: number
    contrast: number
    saturation: number
    hue: number
    grayscale: number
    sepia: number
    invert: number
    blur: number
  } | null
  effects?: {
    colorOverlay: { enabled: boolean; color: string; opacity: number }
    dropShadow: { enabled: boolean; color: string; opacity: number; angle: number; distance: number; blur: number }
    outerGlow: { enabled: boolean; color: string; opacity: number; size: number }
  } | null
  filterGraph?: FilterGraphNode[]
}

export type TypeGpuCompositionAdjustment = {
  kind: 'adjustment'
  blendMode: TypeGpuBlendMode
  opacity: number
  brightness: number
  contrast: number
  saturation: number
  hue: number
  blur: number
}

export type TypeGpuCompositionLayer = TypeGpuCompositionTextureLayer | TypeGpuCompositionAdjustment

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
  const blurTextures = [0, 1].map(() => root.createTexture({
    size: [width, height],
    format: 'rgba8unorm',
  }).$usage('sampled', 'render'))
  const blurSampleViews = blurTextures.map((texture) => texture.createView(d.texture2d(d.f32)))
  const blurRenderViews = blurTextures.map((texture) => texture.createView('render'))
  const blendMode = root.createUniform(d.u32, typeGpuBlendModeCodes.normal)
  const hasMask = root.createUniform(d.u32, 0)
  const hasClip = root.createUniform(d.u32, 0)
  const sourceKind = root.createUniform(d.u32, 0)
  const sourceOpacity = root.createUniform(d.f32, 1)
  const hasLayerFilters = root.createUniform(d.u32, 0)
  const filterBrightness = root.createUniform(d.f32, 1)
  const filterContrast = root.createUniform(d.f32, 1)
  const filterSaturation = root.createUniform(d.f32, 1)
  const filterHue = root.createUniform(d.f32, 0)
  const filterGrayscale = root.createUniform(d.f32, 0)
  const filterSepia = root.createUniform(d.f32, 0)
  const filterInvert = root.createUniform(d.f32, 0)
  const graphPixelate = root.createUniform(d.f32, 0)
  const graphNoise = root.createUniform(d.f32, 0)
  const graphWave = root.createUniform(d.f32, 0)
  const graphWaveSize = root.createUniform(d.f32, 1)
  const graphSharpen = root.createUniform(d.f32, 0)
  const graphEmboss = root.createUniform(d.f32, 0)
  const graphEmbossSize = root.createUniform(d.f32, 1)
  const graphClouds = root.createUniform(d.f32, 0)
  const graphCloudSize = root.createUniform(d.f32, 1)
  const graphSeed = root.createUniform(d.f32, 0)
  const hasColorOverlay = root.createUniform(d.u32, 0)
  const colorOverlayColor = root.createUniform(d.vec3f, d.vec3f(0))
  const colorOverlayOpacity = root.createUniform(d.f32, 0)
  const effectColor = root.createUniform(d.vec3f, d.vec3f(0))
  const effectOpacity = root.createUniform(d.f32, 0)
  const effectOffset = root.createUniform(d.vec2f, d.vec2f(0))
  const adjustmentOpacity = root.createUniform(d.f32, 1)
  const adjustmentBrightness = root.createUniform(d.f32, 1)
  const adjustmentContrast = root.createUniform(d.f32, 1)
  const adjustmentSaturation = root.createUniform(d.f32, 1)
  const adjustmentHue = root.createUniform(d.f32, 0)
  const blurRadius = root.createUniform(d.f32, 0)
  const texelSize = root.createUniform(d.vec2f, d.vec2f(1 / width, 1 / height))
  const sampler = root.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  })
  const createBlurPipeline = (sourceView: (typeof compositionSampleViews)[number], horizontal: boolean) => root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: ({ uv }) => {
      'use gpu'
      const scale = std.max(std.div(blurRadius.$, 4), 0.25)
      const firstOffset = horizontal
        ? d.vec2f(std.mul(std.mul(texelSize.$.x, scale), 1.384615), 0)
        : d.vec2f(0, std.mul(std.mul(texelSize.$.y, scale), 1.384615))
      const secondOffset = horizontal
        ? d.vec2f(std.mul(std.mul(texelSize.$.x, scale), 3.230769), 0)
        : d.vec2f(0, std.mul(std.mul(texelSize.$.y, scale), 3.230769))
      let sample = std.mul(std.textureSample(sourceView.$, sampler.$, uv), 0.227027)
      sample = std.add(sample, std.mul(std.textureSample(sourceView.$, sampler.$, std.add(uv, firstOffset)), 0.316216))
      sample = std.add(sample, std.mul(std.textureSample(sourceView.$, sampler.$, std.sub(uv, firstOffset)), 0.316216))
      sample = std.add(sample, std.mul(std.textureSample(sourceView.$, sampler.$, std.add(uv, secondOffset)), 0.07027))
      return std.add(sample, std.mul(std.textureSample(sourceView.$, sampler.$, std.sub(uv, secondOffset)), 0.07027))
    },
  })
  const horizontalBlurPipelines = compositionSampleViews.map((view) => createBlurPipeline(view, true))
  const layerHorizontalBlurPipeline = createBlurPipeline(layerView, true)
  const verticalBlurPipeline = createBlurPipeline(blurSampleViews[0], false)
  const createBlendPipeline = (backdropIndex: number) => root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: ({ uv }) => {
      'use gpu'
      const pixelCell = std.mul(texelSize.$, std.max(graphPixelate.$, 1))
      let graphUv = std.select(uv, std.add(std.mul(std.floor(std.div(uv, pixelCell)), pixelCell), std.mul(pixelCell, 0.5)), graphPixelate.$ > 1)
      const waveOffset = std.mul(std.sin(std.mul(std.div(graphUv.y, std.mul(texelSize.$.y, std.max(graphWaveSize.$, 1))), 6.283185)), std.mul(graphWave.$, texelSize.$.x))
      graphUv = std.add(graphUv, d.vec2f(waveOffset, 0))
      let rawSourceSample = std.textureSample(layerView.$, sampler.$, graphUv)
      if (graphSharpen.$ > 0) {
        const neighbors = std.add(std.add(std.textureSample(layerView.$, sampler.$, std.add(graphUv, d.vec2f(texelSize.$.x, 0))), std.textureSample(layerView.$, sampler.$, std.sub(graphUv, d.vec2f(texelSize.$.x, 0)))), std.add(std.textureSample(layerView.$, sampler.$, std.add(graphUv, d.vec2f(0, texelSize.$.y))), std.textureSample(layerView.$, sampler.$, std.sub(graphUv, d.vec2f(0, texelSize.$.y)))))
        rawSourceSample = std.sub(std.mul(rawSourceSample, std.add(1, std.mul(graphSharpen.$, 4))), std.mul(neighbors, graphSharpen.$))
      }
      const blurredSourceSample = std.textureSample(blurSampleViews[1].$, sampler.$, uv)
      const filteredSourceSample = std.select(rawSourceSample, blurredSourceSample, blurRadius.$ > 0)
      const sourceSample = std.select(filteredSourceSample, rawSourceSample, sourceKind.$ === 1)
      const maskSample = std.textureSample(maskView.$, sampler.$, uv)
      const clipSample = std.textureSample(clipView.$, sampler.$, uv)
      const backdropSample = std.textureSample(compositionSampleViews[backdropIndex].$, sampler.$, uv)
      let source = sourceSample.xyz
      const maskAlpha = std.select(1, maskSample.w, hasMask.$ === 1)
      const clipAlpha = std.select(1, clipSample.w, hasClip.$ === 1)
      let sourceAlpha = std.mul(sourceSample.w, std.mul(maskAlpha, clipAlpha))
      sourceAlpha = std.mul(sourceAlpha, std.select(sourceOpacity.$, 1, sourceKind.$ === 1))

      if (sourceKind.$ === 1) {
        const blurredSample = std.textureSample(blurSampleViews[1].$, sampler.$, uv)
        const adjustmentSample = std.select(blurredSample, backdropSample, blurRadius.$ <= 0)
        const adjustmentAlpha = adjustmentSample.w
        const adjustmentBackdrop = std.div(adjustmentSample.xyz, std.max(adjustmentAlpha, 0.00001))
        source = gpuApplyAdjustment(
          adjustmentBackdrop,
          adjustmentBrightness.$,
          adjustmentContrast.$,
          adjustmentSaturation.$,
          adjustmentHue.$,
        )
        sourceAlpha = std.mul(adjustmentAlpha, adjustmentOpacity.$)
      } else if (sourceKind.$ === 2) {
        const effectUv = std.sub(uv, effectOffset.$)
        const rawEffectSample = std.textureSample(layerView.$, sampler.$, effectUv)
        const blurredEffectSample = std.textureSample(blurSampleViews[1].$, sampler.$, effectUv)
        const effectSample = std.select(rawEffectSample, blurredEffectSample, blurRadius.$ > 0)
        const tintedEffect = gpuTintEffect(effectSample.w, effectColor.$, effectOpacity.$)
        source = tintedEffect.xyz
        sourceAlpha = tintedEffect.w
      } else {
        if (hasColorOverlay.$ === 1) source = std.mix(source, colorOverlayColor.$, colorOverlayOpacity.$)
        if (hasLayerFilters.$ === 1) {
          source = gpuApplyLayerFilters(
            source,
            filterBrightness.$,
            filterContrast.$,
            filterSaturation.$,
            filterHue.$,
            filterGrayscale.$,
            filterSepia.$,
            filterInvert.$,
          )
        }
        const noise = std.sub(gpuProceduralNoise(std.div(graphUv, texelSize.$), graphSeed.$), 0.5)
        source = std.add(source, d.vec3f(std.mul(noise, graphNoise.$)))
        if (graphEmboss.$ > 0) {
          const embossSample = std.textureSample(layerView.$, sampler.$, std.sub(graphUv, std.mul(texelSize.$, graphEmbossSize.$))).xyz
          source = std.mix(source, std.add(d.vec3f(0.5), std.sub(source, embossSample)), graphEmboss.$)
        }
        const cloud = gpuProceduralNoise(std.div(graphUv, std.mul(texelSize.$, graphCloudSize.$)), graphSeed.$)
        source = std.mix(source, d.vec3f(cloud), graphClouds.$)
        source = std.clamp(source, d.vec3f(0), d.vec3f(1))
      }
      return gpuCompositePixel(backdropSample, source, sourceAlpha, blendMode.$)
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
  const colorVector = (value: string) => {
    const color = Number.parseInt(value.slice(1), 16)
    return d.vec3f(((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255)
  }

  return {
    canvas,
    compose(layers) {
      compositionTextures[0].clear()
      let step = 0
      const drawBlendPass = () => {
        const backdropIndex = step % 2
        const outputIndex = 1 - backdropIndex
        blendPipelines[backdropIndex].withColorAttachment({
          view: compositionRenderViews[outputIndex],
          loadOp: 'clear',
        }).draw(3)
        step += 1
      }
      const blurLayerSource = (radius: number) => {
        blurRadius.write(radius)
        if (radius <= 0) return
        layerHorizontalBlurPipeline.withColorAttachment({ view: blurRenderViews[0], loadOp: 'clear' }).draw(3)
        verticalBlurPipeline.withColorAttachment({ view: blurRenderViews[1], loadOp: 'clear' }).draw(3)
      }
      const drawEffect = (color: string, opacity: number, radius: number, offset = { x: 0, y: 0 }) => {
        blurLayerSource(radius)
        sourceKind.write(2)
        hasLayerFilters.write(0)
        hasColorOverlay.write(0)
        hasMask.write(0)
        hasClip.write(0)
        effectColor.write(colorVector(color))
        effectOpacity.write(opacity)
        effectOffset.write(d.vec2f(offset.x, offset.y))
        blendMode.write(typeGpuBlendModeCodes.normal)
        drawBlendPass()
      }

      layers.forEach((layer) => {
        const backdropIndex = step % 2
        if (layer.kind === 'adjustment') {
          sourceKind.write(1)
          hasLayerFilters.write(0)
          hasColorOverlay.write(0)
          hasMask.write(0)
          hasClip.write(0)
          adjustmentOpacity.write(layer.opacity)
          adjustmentBrightness.write(layer.brightness)
          adjustmentContrast.write(layer.contrast)
          adjustmentSaturation.write(layer.saturation)
          adjustmentHue.write(layer.hue)
          blurRadius.write(layer.blur)
          if (layer.blur > 0) {
            horizontalBlurPipelines[backdropIndex].withColorAttachment({ view: blurRenderViews[0], loadOp: 'clear' }).draw(3)
            verticalBlurPipeline.withColorAttachment({ view: blurRenderViews[1], loadOp: 'clear' }).draw(3)
          }
        } else {
          layerTexture.write(layer.source)
          const glow = layer.effects?.outerGlow
          if (glow?.enabled) drawEffect(glow.color, glow.opacity / 100, glow.size)
          const shadow = layer.effects?.dropShadow
          if (shadow?.enabled) {
            const offset = calculateEffectOffset(shadow.angle, shadow.distance, width, height)
            drawEffect(shadow.color, shadow.opacity / 100, shadow.blur, offset)
          }
          sourceKind.write(0)
          sourceOpacity.write(layer.opacity ?? 1)
          hasLayerFilters.write(layer.filters ? 1 : 0)
          if (layer.filters) {
            filterBrightness.write(layer.filters.brightness / 100)
            filterContrast.write(layer.filters.contrast / 100)
            filterSaturation.write(layer.filters.saturation / 100)
            filterHue.write(layer.filters.hue * Math.PI / 180)
            filterGrayscale.write(layer.filters.grayscale / 100)
            filterSepia.write(layer.filters.sepia / 100)
            filterInvert.write(layer.filters.invert / 100)
          }
          const graph = (layer.filterGraph ?? []).filter((node) => node.enabled)
          const graphValue = (kind: FilterGraphNode['kind'], field: 'amount' | 'size', fallback = 0) => graph.findLast((node) => node.kind === kind)?.[field] ?? fallback
          graphPixelate.write(graphValue('pixelate', 'size'))
          graphNoise.write(graphValue('noise', 'amount') / 100)
          graphWave.write(graphValue('wave', 'amount') / 5)
          graphWaveSize.write(graphValue('wave', 'size', 1))
          graphSharpen.write(graphValue('sharpen', 'amount') / 100)
          graphEmboss.write(graphValue('emboss', 'amount') / 100)
          graphEmbossSize.write(graphValue('emboss', 'size', 1))
          graphClouds.write(graphValue('clouds', 'amount') / 100)
          graphCloudSize.write(graphValue('clouds', 'size', 1))
          graphSeed.write(graph.findLast((node) => node.kind === 'noise' || node.kind === 'clouds')?.seed ?? 0)
          const graphBlur = Math.max(layer.filters?.blur ?? 0, graphValue('gaussian-blur', 'size'))
          blurRadius.write(graphBlur)
          const overlay = layer.effects?.colorOverlay
          hasColorOverlay.write(overlay?.enabled ? 1 : 0)
          if (overlay?.enabled) {
            colorOverlayColor.write(colorVector(overlay.color))
            colorOverlayOpacity.write(overlay.opacity / 100)
          }
          if (layer.maskSource) maskTexture.write(layer.maskSource)
          if (layer.clipSource) clipTexture.write(layer.clipSource)
          hasMask.write(layer.maskSource ? 1 : 0)
          hasClip.write(layer.clipSource ? 1 : 0)
          if (graphBlur > 0) {
            blurLayerSource(graphBlur)
          }
        }
        blendMode.write(typeGpuBlendModeCodes[layer.blendMode])
        drawBlendPass()
      })
      const finalIndex = step % 2
      presentPipelines[finalIndex].withColorAttachment({ view: context, loadOp: 'clear' }).draw(3)
    },
    dispose() {
      layerTexture.destroy()
      maskTexture.destroy()
      clipTexture.destroy()
      compositionTextures.forEach((texture) => texture.destroy())
      blurTextures.forEach((texture) => texture.destroy())
      blendMode.buffer.destroy()
      hasMask.buffer.destroy()
      hasClip.buffer.destroy()
      sourceKind.buffer.destroy()
      sourceOpacity.buffer.destroy()
      hasLayerFilters.buffer.destroy()
      filterBrightness.buffer.destroy()
      filterContrast.buffer.destroy()
      filterSaturation.buffer.destroy()
      filterHue.buffer.destroy()
      filterGrayscale.buffer.destroy()
      filterSepia.buffer.destroy()
      filterInvert.buffer.destroy()
      graphPixelate.buffer.destroy()
      graphNoise.buffer.destroy()
      graphWave.buffer.destroy()
      graphWaveSize.buffer.destroy()
      graphSharpen.buffer.destroy()
      graphEmboss.buffer.destroy()
      graphEmbossSize.buffer.destroy()
      graphClouds.buffer.destroy()
      graphCloudSize.buffer.destroy()
      graphSeed.buffer.destroy()
      hasColorOverlay.buffer.destroy()
      colorOverlayColor.buffer.destroy()
      colorOverlayOpacity.buffer.destroy()
      effectColor.buffer.destroy()
      effectOpacity.buffer.destroy()
      effectOffset.buffer.destroy()
      adjustmentOpacity.buffer.destroy()
      adjustmentBrightness.buffer.destroy()
      adjustmentContrast.buffer.destroy()
      adjustmentSaturation.buffer.destroy()
      adjustmentHue.buffer.destroy()
      blurRadius.buffer.destroy()
      texelSize.buffer.destroy()
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
    kind: 'layer',
    source: new ImageData(new Uint8ClampedArray([0, 0, 0, 0]), 1, 1),
    blendMode: 'normal',
  }])
  compositor.dispose()
}
