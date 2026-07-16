import { getDocumentSize } from './presets'
import { layerFilterCss, normalizeLayerFilters } from './filters'
import type { AssetMap } from './runtime-assets'
import type { RasterRegion } from './raster'
import { hexToRgba } from './raster'
import { buildCompositionRenderPlan, buildNativeLayerCompositionPlan, type AdjustmentRenderNode, type RenderPlanNode } from './rendering/render-plan'
import { RenderResourceRegistry } from './rendering/render-resource-registry'
import { backgroundPassSignature, groupPassSignature, layerPassSignature, layerPassStructureSignature, maskedLayerPassSignature, type RenderPassCache } from './rendering/render-pass-cache'
import type { TypeGpuBlendMode } from './rendering/typegpu-blend-modes'
import { flattenStackLayers, layerIsLocked, layerIsVisible } from './stack'
import { quadBounds, smartObjectDisplayQuad, smartObjectSourceQuad } from './smart-objects'
import { geometryMesh, geometryTransformIsIdentity } from './transform'
import { applyPixelFilterGraph, normalizeFilterGraph } from './filter-graph'
import type { AdjustmentDescriptor, BlendMode, EditorDocument, EditorLayer, FilterGraphNode, ImageLayer, LayerEffects, LayerFilters, Position, RasterLayer, ShapeLayer, SmartObjectLayer, TextLayer, TextStyleRun } from './types'
import { flattenTextPath, polylineLength, samplePolyline, textWarpOffset, wrapTextRanges } from './typography'
import { patternBitmapCanvas } from './patterns'

export type LayerBounds = { x: number; y: number; width: number; height: number; rotation: number }
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type RenderCompositionOptions = {
  showSelection?: boolean
  /** Capture a document-space region without clipping layers to the document edges. */
  viewport?: { x: number; y: number; width: number; height: number }
}
export type NativeTextureLayerPass = {
  kind: 'layer'
  source: HTMLCanvasElement
  maskSource?: HTMLCanvasElement | HTMLImageElement
  clipSource?: HTMLCanvasElement
  filterMaskSource?: HTMLCanvasElement | HTMLImageElement
  blendMode: TypeGpuBlendMode
  opacity?: number
  filters?: LayerFilters | null
  effects?: LayerEffects | null
  filterGraph?: FilterGraphNode[]
}
export type NativeAdjustmentPass = {
  kind: 'adjustment'
  blendMode: TypeGpuBlendMode
  opacity: number
  brightness: number
  contrast: number
  saturation: number
  hue: number
  blur: number
}
export type NativeLayerPass = NativeTextureLayerPass | NativeAdjustmentPass
export type NativeLayerPasses = { width: number; height: number; layers: NativeLayerPass[] }

export function calculateImageRect(
  canvasWidth: number,
  canvasHeight: number,
  imageWidth: number,
  imageHeight: number,
  layer: Pick<ImageLayer, 'padding' | 'scale' | 'position' | 'rotation'>,
): LayerBounds {
  const paddingX = canvasWidth * (layer.padding / 100)
  const paddingY = canvasHeight * (layer.padding / 100)
  const availableWidth = Math.max(1, canvasWidth - paddingX * 2)
  const availableHeight = Math.max(1, canvasHeight - paddingY * 2)
  const fitScale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight)
  const scale = fitScale * (layer.scale / 100)
  const width = imageWidth * scale
  const height = imageHeight * scale

  return {
    x: (canvasWidth - width) / 2 + layer.position.x * canvasWidth,
    y: (canvasHeight - height) / 2 + layer.position.y * canvasHeight,
    width,
    height,
    rotation: layer.rotation,
  }
}

type CanvasImageResource = {
  source: HTMLCanvasElement | HTMLImageElement
  width: number
  height: number
  mipmaps: Map<number, { source: HTMLCanvasElement; lastUsed: number }>
  mipmapPixels: number
  enforceBudget: () => void
}

const MAX_MIPMAP_PIXELS_PER_ASSET = 4_194_304
let mipmapClock = 0

export function selectMipmapLevel(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number) {
  const downscale = Math.min(sourceWidth / Math.max(1, targetWidth), sourceHeight / Math.max(1, targetHeight))
  return Math.max(0, Math.min(8, Math.floor(Math.log2(Math.max(1, downscale)))))
}

function mipmapSource(image: CanvasImageResource, targetWidth: number, targetHeight: number) {
  const level = selectMipmapLevel(image.width, image.height, targetWidth, targetHeight)
  if (level === 0) return image.source
  const cached = image.mipmaps.get(level)
  if (cached) {
    cached.lastUsed = ++mipmapClock
    return cached.source
  }
  const scale = 2 ** level
  const mipmapWidth = Math.max(1, Math.ceil(image.width / scale))
  const mipmapHeight = Math.max(1, Math.ceil(image.height / scale))
  if (mipmapWidth * mipmapHeight > MAX_MIPMAP_PIXELS_PER_ASSET) return image.source
  const canvas = globalThis.document.createElement('canvas')
  canvas.width = mipmapWidth
  canvas.height = mipmapHeight
  const context = canvas.getContext('2d')
  if (!context) return image.source
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image.source, 0, 0, canvas.width, canvas.height)
  image.mipmaps.set(level, { source: canvas, lastUsed: ++mipmapClock })
  image.mipmapPixels += canvas.width * canvas.height
  while (image.mipmapPixels > MAX_MIPMAP_PIXELS_PER_ASSET && image.mipmaps.size > 1) {
    const evicted = [...image.mipmaps.entries()]
      .filter(([candidate]) => candidate !== level)
      .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0]
    if (!evicted) break
    image.mipmaps.delete(evicted[0])
    image.mipmapPixels -= evicted[1].source.width * evicted[1].source.height
    evicted[1].source.width = 0
    evicted[1].source.height = 0
  }
  image.enforceBudget()
  return canvas
}

function canvasImageResource(resources: RenderResourceRegistry, assets: AssetMap, assetId: string): CanvasImageResource | null {
  const asset = assets[assetId]
  if (!asset) return null
  return resources.resolve('canvas2d', assetId, asset, (source) => {
    const resource: CanvasImageResource = {
      source: source.surface ?? source.element,
      width: source.surface?.width ?? source.element.naturalWidth,
      height: source.surface?.height ?? source.element.naturalHeight,
      mipmaps: new Map(),
      mipmapPixels: 0,
      enforceBudget: () => resources.enforceBudget('canvas2d', assetId),
    }
    return {
      resource,
      byteSize: () => resource.mipmapPixels * 4,
      dispose: () => {
        for (const mipmap of resource.mipmaps.values()) {
          mipmap.source.width = 0
          mipmap.source.height = 0
        }
        resource.mipmaps.clear()
        resource.mipmapPixels = 0
      },
    }
  })
}

function drawCover(context: CanvasRenderingContext2D, image: CanvasImageResource, width: number, height: number) {
  const scale = Math.max(width / image.width, height / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  context.drawImage(mipmapSource(image, drawWidth, drawHeight), (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
}

function drawGradient(context: CanvasRenderingContext2D, width: number, height: number, colors: [string, string], angleValue: number) {
  const angle = (angleValue * Math.PI) / 180
  const centerX = width / 2
  const centerY = height / 2
  const radius = Math.abs(width * Math.sin(angle)) + Math.abs(height * Math.cos(angle))
  const x = Math.cos(angle) * radius * 0.5
  const y = Math.sin(angle) * radius * 0.5
  const gradient = context.createLinearGradient(centerX - x, centerY - y, centerX + x, centerY + y)
  gradient.addColorStop(0, colors[0])
  gradient.addColorStop(1, colors[1])
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)
}

function drawBackground(context: CanvasRenderingContext2D, width: number, height: number, document: EditorDocument, assets: AssetMap, resources: RenderResourceRegistry) {
  if (document.artboards?.length) {
    context.clearRect(0, 0, width, height)
    for (const artboard of document.artboards) {
      if (artboard.background.kind !== 'color') continue
      context.fillStyle = artboard.background.color
      context.fillRect(artboard.x, artboard.y, artboard.width, artboard.height)
    }
    return
  }
  const background = document.background
  const backgroundImage = background.imageAssetId ? canvasImageResource(resources, assets, background.imageAssetId) : null
  if (background.kind === 'transparent') {
    context.clearRect(0, 0, width, height)
  } else if (background.kind === 'solid') {
    context.fillStyle = background.solidColor
    context.fillRect(0, 0, width, height)
  } else if (background.kind === 'image' && backgroundImage) {
    context.save()
    context.filter = background.imageBlur ? `blur(${background.imageBlur}px)` : 'none'
    const bleed = background.imageBlur * 2
    context.translate(-bleed, -bleed)
    drawCover(context, backgroundImage, width + bleed * 2, height + bleed * 2)
    context.restore()
    if (background.imageOverlay > 0) {
      context.fillStyle = `rgba(0,0,0,${background.imageOverlay / 100})`
      context.fillRect(0, 0, width, height)
    }
  } else {
    drawGradient(context, width, height, background.gradient, background.gradientAngle)
    const glow = context.createRadialGradient(width * 0.75, height * 0.1, 0, width * 0.75, height * 0.1, width * 0.75)
    glow.addColorStop(0, 'rgba(255,255,255,0.12)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = glow
    context.fillRect(0, 0, width, height)
  }
}

function drawPattern(context: CanvasRenderingContext2D, width: number, height: number, document: EditorDocument) {
  const pattern = document.pattern
  if (pattern.kind === 'none' || pattern.opacity === 0) return
  const spacing = Math.max(12, pattern.size)
  context.save()
  if (document.artboards?.length) {
    context.beginPath()
    for (const artboard of document.artboards) context.rect(artboard.x, artboard.y, artboard.width, artboard.height)
    context.clip()
  }
  context.globalAlpha = pattern.opacity / 100
  context.strokeStyle = pattern.color
  context.fillStyle = pattern.color
  context.lineWidth = Math.max(1, width / 1200)

  if (pattern.kind === 'bitmap' && pattern.bitmap) {
    const source = patternBitmapCanvas(pattern.bitmap)
    const tile = globalThis.document.createElement('canvas')
    tile.width = Math.max(1, spacing)
    tile.height = Math.max(1, Math.round(spacing * source.height / source.width))
    tile.getContext('2d')?.drawImage(source, 0, 0, tile.width, tile.height)
    context.fillStyle = context.createPattern(tile, 'repeat') ?? pattern.color
    context.fillRect(0, 0, width, height)
  } else if (pattern.kind === 'grid') {
    context.beginPath()
    for (let x = 0; x <= width; x += spacing) {
      context.moveTo(x, 0)
      context.lineTo(x, height)
    }
    for (let y = 0; y <= height; y += spacing) {
      context.moveTo(0, y)
      context.lineTo(width, y)
    }
    context.stroke()
  } else if (pattern.kind === 'dots') {
    const radius = Math.max(1.5, spacing / 16)
    for (let x = spacing / 2; x < width; x += spacing) {
      for (let y = spacing / 2; y < height; y += spacing) {
        context.beginPath()
        context.arc(x, y, radius, 0, Math.PI * 2)
        context.fill()
      }
    }
  } else {
    for (let y = spacing; y < height + spacing; y += spacing) {
      context.beginPath()
      for (let x = 0; x <= width; x += 12) {
        const waveY = y + Math.sin((x / spacing) * Math.PI * 2) * (spacing * 0.18)
        if (x === 0) context.moveTo(x, waveY)
        else context.lineTo(x, waveY)
      }
      context.stroke()
    }
  }
  context.restore()
}

function withLayerTransform(
  context: CanvasRenderingContext2D,
  bounds: LayerBounds,
  flipX: boolean,
  flipY: boolean,
  draw: () => void,
) {
  context.save()
  context.translate(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  context.rotate((bounds.rotation * Math.PI) / 180)
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1)
  draw()
  context.restore()
}

function drawImageLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: ImageLayer, assets: AssetMap, resources: RenderResourceRegistry) {
  const asset = canvasImageResource(resources, assets, layer.assetId)
  if (!asset) return
  const bounds = calculateImageRect(canvas.width, canvas.height, asset.width, asset.height, layer)
  const radius = Math.min(layer.cornerRadius, bounds.width / 2, bounds.height / 2)

  context.globalAlpha = layer.opacity / 100
  withLayerTransform(context, bounds, layer.flipX, layer.flipY, () => {
    const x = -bounds.width / 2
    const y = -bounds.height / 2
    if (layer.shadow > 0) {
      context.save()
      context.shadowColor = `rgba(5,5,10,${Math.min(0.55, 0.18 + layer.shadow / 180)})`
      context.shadowBlur = layer.shadow * 1.25
      context.shadowOffsetY = layer.shadow * 0.35
      context.fillStyle = 'rgba(255,255,255,0.98)'
      context.beginPath()
      context.roundRect(x, y, bounds.width, bounds.height, radius)
      context.fill()
      context.restore()
    }
    context.save()
    context.beginPath()
    context.roundRect(x, y, bounds.width, bounds.height, radius)
    context.clip()
    context.drawImage(mipmapSource(asset, bounds.width, bounds.height), x, y, bounds.width, bounds.height)
    context.restore()
    context.strokeStyle = 'rgba(255,255,255,0.16)'
    context.lineWidth = Math.max(1, canvas.width / 900)
    context.beginPath()
    context.roundRect(x, y, bounds.width, bounds.height, radius)
    context.stroke()
  })
  context.globalAlpha = 1
}

export function rasterBounds(canvas: HTMLCanvasElement, layer: RasterLayer | SmartObjectLayer): LayerBounds {
  const width = layer.width * layer.scale / 100
  const height = layer.height * layer.scale / 100
  return {
    x: canvas.width / 2 - width / 2 + layer.position.x * canvas.width,
    y: canvas.height / 2 - height / 2 + layer.position.y * canvas.height,
    width,
    height,
    rotation: layer.rotation,
  }
}

function rasterRegionToDocument(canvas: HTMLCanvasElement, layer: RasterLayer, sourceWidth: number, sourceHeight: number, region: RasterRegion): RasterRegion {
  const bounds = rasterBounds(canvas, layer)
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const angle = bounds.rotation * Math.PI / 180
  const points = [
    [region.x, region.y],
    [region.x + region.width, region.y],
    [region.x, region.y + region.height],
    [region.x + region.width, region.y + region.height],
  ].map(([sourceX, sourceY]) => {
    let localX = (sourceX / sourceWidth - 0.5) * bounds.width
    let localY = (sourceY / sourceHeight - 0.5) * bounds.height
    if (layer.flipX) localX *= -1
    if (layer.flipY) localY *= -1
    return {
      x: centerX + localX * Math.cos(angle) - localY * Math.sin(angle),
      y: centerY + localX * Math.sin(angle) + localY * Math.cos(angle),
    }
  })
  const left = Math.min(...points.map((point) => point.x)) - 2
  const top = Math.min(...points.map((point) => point.y)) - 2
  const right = Math.max(...points.map((point) => point.x)) + 2
  const bottom = Math.max(...points.map((point) => point.y)) + 2
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function drawRasterLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: RasterLayer | SmartObjectLayer, assets: AssetMap, resources: RenderResourceRegistry) {
  const asset = canvasImageResource(resources, assets, layer.assetId)
  if (!asset) return
  const bounds = rasterBounds(canvas, layer)
  context.globalAlpha = layer.opacity / 100
  withLayerTransform(context, bounds, Boolean(layer.flipX), Boolean(layer.flipY), () => {
    context.drawImage(mipmapSource(asset, bounds.width, bounds.height), -bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height)
  })
  context.globalAlpha = 1
}

const MAX_SMART_FILTER_CACHE_ENTRIES = 64
const MAX_SMART_FILTER_CACHE_BYTES = 256 * 1024 * 1024
const smartFilterResultCache = new Map<string, { canvas: HTMLCanvasElement; lastUsed: number; bytes: number }>()
let smartFilterCacheClock = 0
let smartFilterCacheBytes = 0

export function clearSmartFilterResultCache() {
  for (const entry of smartFilterResultCache.values()) {
    entry.canvas.width = 0
    entry.canvas.height = 0
  }
  smartFilterResultCache.clear()
  smartFilterCacheClock = 0
  smartFilterCacheBytes = 0
}

export function smartFilterResultCacheSize() {
  return smartFilterResultCache.size
}

export function smartFilterResultCacheUsage() {
  return { entries: smartFilterResultCache.size, bytes: smartFilterCacheBytes }
}

function cacheSmartFilterResult(key: string, canvas: HTMLCanvasElement) {
  const existing = smartFilterResultCache.get(key)
  if (existing) smartFilterCacheBytes -= existing.bytes
  const bytes = canvas.width * canvas.height * 4
  smartFilterResultCache.set(key, { canvas, lastUsed: ++smartFilterCacheClock, bytes })
  smartFilterCacheBytes += bytes
  while (smartFilterResultCache.size > MAX_SMART_FILTER_CACHE_ENTRIES || smartFilterCacheBytes > MAX_SMART_FILTER_CACHE_BYTES) {
    const oldest = [...smartFilterResultCache.entries()].sort((left, right) => (
      left[1].lastUsed - right[1].lastUsed || left[0].localeCompare(right[0])
    ))[0]
    if (!oldest) break
    smartFilterResultCache.delete(oldest[0])
    smartFilterCacheBytes -= oldest[1].bytes
    if (oldest[1].canvas !== canvas) {
      oldest[1].canvas.width = 0
      oldest[1].canvas.height = 0
    }
  }
}

function drawSmartObjectLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: SmartObjectLayer, assets: AssetMap, resources: RenderResourceRegistry) {
  const asset = canvasImageResource(resources, assets, layer.assetId)
  const quad = smartObjectSourceQuad(layer)
  if (!asset) return
  const visibleFilters = layer.smartFilters.filter((filter) => filter.visible)
  const filterCacheKey = visibleFilters.length ? JSON.stringify([
    layer.contentHash ?? layer.assetId,
    assets[layer.assetId]?.revision ?? 0,
    visibleFilters,
    visibleFilters.map((filter) => filter.maskAssetId ? assets[filter.maskAssetId]?.revision ?? 0 : null),
  ]) : ''
  const cached = filterCacheKey ? smartFilterResultCache.get(filterCacheKey) : undefined
  if (cached) cached.lastUsed = ++smartFilterCacheClock
  let filteredSource = cached?.canvas ?? asset.source
  for (const filter of cached ? [] : visibleFilters) {
    const filtered = document.createElement('canvas')
    filtered.width = layer.width
    filtered.height = layer.height
    const filteredContext = filtered.getContext('2d', { willReadFrequently: true })
    if (!filteredContext) continue
    filteredContext.filter = layerFilterCss(normalizeLayerFilters(filter.settings))
    filteredContext.drawImage(filteredSource, 0, 0, layer.width, layer.height)
    filteredContext.filter = 'none'
    const mask = filter.maskAssetId ? canvasImageResource(resources, assets, filter.maskAssetId) : null
    if (mask) {
      const alphaMask = document.createElement('canvas')
      alphaMask.width = layer.width
      alphaMask.height = layer.height
      const maskContext = alphaMask.getContext('2d', { willReadFrequently: true })
      if (maskContext) {
        maskContext.drawImage(mask.source, 0, 0, layer.width, layer.height)
        mutateCanvasStripes(maskContext, alphaMask, (pixels) => {
          for (let index = 0; index < pixels.data.length; index += 4) {
            const luminance = pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114
            pixels.data[index + 3] = Math.round(luminance * pixels.data[index + 3] / 255)
          }
        })
        filteredContext.globalCompositeOperation = 'destination-in'
        filteredContext.drawImage(alphaMask, 0, 0)
        filteredContext.globalCompositeOperation = 'source-over'
      }
    }
    const composited = document.createElement('canvas')
    composited.width = layer.width
    composited.height = layer.height
    const compositedContext = composited.getContext('2d')
    if (!compositedContext) continue
    compositedContext.drawImage(filteredSource, 0, 0, layer.width, layer.height)
    compositedContext.globalAlpha = filter.opacity / 100
    compositedContext.globalCompositeOperation = filter.blendMode === 'normal' ? 'source-over' : filter.blendMode
    compositedContext.drawImage(filtered, 0, 0)
    filteredSource = composited
  }
  if (!cached && filterCacheKey) cacheSmartFilterResult(filterCacheKey, filteredSource as HTMLCanvasElement)
  if (!layer.transformMatrix || !quad) {
    const bounds = rasterBounds(canvas, layer)
    context.globalAlpha = layer.opacity / 100
    withLayerTransform(context, bounds, Boolean(layer.flipX), Boolean(layer.flipY), () => context.drawImage(filteredSource, -bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height))
    context.globalAlpha = 1
    return
  }
  const center = {
    x: quad.reduce((total, point) => total + point.x, 0) / quad.length,
    y: quad.reduce((total, point) => total + point.y, 0) / quad.length,
  }
  context.save()
  context.globalAlpha = layer.opacity / 100
  context.translate(layer.position.x * canvas.width, layer.position.y * canvas.height)
  context.translate(center.x, center.y)
  context.rotate(layer.rotation * Math.PI / 180)
  context.scale(layer.scale / 100 * (layer.flipX ? -1 : 1), layer.scale / 100 * (layer.flipY ? -1 : 1))
  context.translate(-center.x, -center.y)
  context.transform(...layer.transformMatrix)
  context.drawImage(visibleFilters.length ? filteredSource : mipmapSource(asset, layer.width, layer.height), 0, 0, layer.width, layer.height)
  context.restore()
}

function textStyleAt(layer: TextLayer, index: number): TextStyleRun {
  return layer.styleRuns?.find((run) => index >= run.start && index < run.start + run.length) ?? {
    start: 0,
    length: layer.text.length,
    fontFamily: layer.fontFamily || 'Inter',
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    color: layer.color,
    letterSpacing: layer.letterSpacing,
    leading: layer.leading,
    baselineShift: layer.baselineShift,
    horizontalScale: layer.horizontalScale,
    verticalScale: layer.verticalScale,
    fauxItalic: layer.fauxItalic,
    underline: layer.underline,
    strikethrough: layer.strikethrough,
    kerning: layer.kerning,
    openTypeFeatures: layer.openTypeFeatures,
    variableAxes: layer.variableAxes,
  }
}

function setTextStyle(context: CanvasRenderingContext2D, layer: TextLayer, style = textStyleAt(layer, 0)) {
  const family = style.fontFamily.replace(/["\\]/g, '')
  const fallback = (layer.fallbackFonts ?? ['Inter', 'system-ui', 'sans-serif']).map((name) => /^(serif|sans-serif|monospace|system-ui)$/.test(name) ? name : `"${name.replace(/["\\]/g, '')}"`).join(', ')
  context.font = `${style.fauxItalic ? 'italic ' : ''}${style.fontWeight} ${style.fontSize}px "${family}", ${fallback}`
  context.textBaseline = 'middle'
  context.textAlign = 'left'
  const advancedContext = context as CanvasRenderingContext2D & {
    letterSpacing: string
    fontKerning: string
    fontVariantCaps: string
    fontFeatureSettings: string
    fontVariationSettings: string
  }
  advancedContext.letterSpacing = `${style.letterSpacing}px`
  advancedContext.fontKerning = style.kerning ?? layer.kerning ?? 'auto'
  const features = style.openTypeFeatures ?? layer.openTypeFeatures ?? []
  advancedContext.fontFeatureSettings = features.map((feature) => `"${feature}" 1`).join(', ')
  advancedContext.fontVariantCaps = features.includes('smcp') ? 'small-caps' : 'normal'
  const axes = style.variableAxes ?? layer.variableAxes ?? {}
  advancedContext.fontVariationSettings = Object.entries(axes).map(([axis, value]) => `"${axis}" ${value}`).join(', ')
}

function textMetrics(context: CanvasRenderingContext2D, layer: TextLayer) {
  context.save()
  const measure = (start: number, end: number) => {
    let width = 0
    for (let index = start; index < end; index += 1) {
      const character = layer.text[index]
      const style = textStyleAt(layer, index)
      setTextStyle(context, layer, style)
      width += context.measureText(character).width + style.letterSpacing
    }
    return width
  }
  const lines = wrapTextRanges(layer.text, layer.paragraphBox?.width ?? Number.MAX_SAFE_INTEGER, measure)
  const widths = lines.map((line) => measure(line.start, line.end))
  const maximumSize = Math.max(layer.fontSize, ...(layer.styleRuns?.map((run) => run.fontSize) ?? []))
  const width = layer.paragraphBox?.width ?? (layer.orientation === 'vertical' ? maximumSize * Math.max(1, lines.length) : Math.max(maximumSize, ...widths))
  const lineHeight = layer.leading ?? Math.max(maximumSize * 1.18, ...(layer.styleRuns?.map((run) => run.leading ?? 0) ?? []))
  const height = layer.paragraphBox?.height ?? (layer.orientation === 'vertical' ? Math.max(lineHeight, layer.text.replace(/\n/g, '').length * lineHeight) : lineHeight * lines.length)
  context.restore()
  return { lines, width, height, lineHeight }
}

function paragraphStyleAt(layer: TextLayer, index: number) {
  return layer.paragraphRuns?.find((run) => index >= run.start && index < run.start + run.length) ?? {
    textAlign: layer.textAlign === 'justify' ? 'justify' as const : layer.textAlign,
    ...(layer.paragraphStyle ?? {}),
  }
}

function drawTextLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: TextLayer) {
  if (layer.textPath?.path) {
    const points = flattenTextPath(layer.textPath.path, canvas.width, canvas.height)
    const pathLength = polylineLength(points)
    let distance = pathLength * layer.textPath.offset / 100
    context.save()
    context.globalAlpha = layer.opacity / 100
    for (let index = 0; index < layer.text.length; index += 1) {
      const character = layer.text[index]
      if (character === '\n' || character === '\r') continue
      const style = textStyleAt(layer, index)
      setTextStyle(context, layer, style)
      const advance = context.measureText(character).width * (style.horizontalScale ?? 100) / 100 + style.letterSpacing
      const sample = samplePolyline(points, distance + advance / 2)
      if (!sample) break
      context.save()
      context.translate(sample.x, sample.y)
      context.rotate(sample.angle + (layer.textPath.flip ? Math.PI : 0))
      context.scale((style.horizontalScale ?? 100) / 100, (style.verticalScale ?? 100) / 100)
      context.fillStyle = style.color
      context.fillText(character, -context.measureText(character).width / 2, layer.textPath.flip ? style.fontSize : -style.fontSize * 0.15)
      context.restore()
      distance += advance
    }
    context.restore()
    return
  }
  const metrics = textMetrics(context, layer)
  const centerX = canvas.width / 2 + layer.position.x * canvas.width
  const centerY = canvas.height / 2 + layer.position.y * canvas.height
  const bounds = { x: centerX - metrics.width / 2, y: centerY - metrics.height / 2, width: metrics.width, height: metrics.height, rotation: layer.rotation }

  context.globalAlpha = layer.opacity / 100
  withLayerTransform(context, bounds, Boolean(layer.flipX), Boolean(layer.flipY), () => {
    if (layer.paragraphBox) {
      context.beginPath()
      context.rect(-metrics.width / 2, -metrics.height / 2, metrics.width, metrics.height)
      context.clip()
    }
    if (layer.orientation === 'vertical') {
      const characters = [...layer.text].filter((character) => character !== '\n' && character !== '\r')
      characters.forEach((character, index) => {
        const style = textStyleAt(layer, index)
        setTextStyle(context, layer, style)
        context.fillStyle = style.color
        const y = -metrics.height / 2 + metrics.lineHeight / 2 + index * metrics.lineHeight
        context.fillText(character, -context.measureText(character).width / 2, y)
      })
      return
    }

    let sourceIndex = 0
    metrics.lines.forEach((line, lineIndex) => {
      sourceIndex = line.start
      const lineText = layer.text.slice(line.start, line.end)
      const glyphs = [...lineText].map((character) => {
        const index = sourceIndex
        const style = textStyleAt(layer, index)
        setTextStyle(context, layer, style)
        const width = context.measureText(character).width + style.letterSpacing
        sourceIndex += 1
        return { character, index, style, width }
      })
      const paragraph = paragraphStyleAt(layer, line.start)
      const lineWidth = glyphs.reduce((total, glyph) => total + glyph.width, 0)
      const startIndent = paragraph.startIndent ?? 0
      const endIndent = paragraph.endIndent ?? 0
      const firstIndent = line.start === 0 || layer.text[line.start - 1] === '\n' ? paragraph.firstLineIndent ?? 0 : 0
      const availableWidth = Math.max(0, metrics.width - startIndent - endIndent - firstIndent)
      let x = paragraph.textAlign === 'center' ? -lineWidth / 2 : paragraph.textAlign === 'right' ? metrics.width / 2 - endIndent - lineWidth : -metrics.width / 2 + startIndent + firstIndent
      const spaces = glyphs.filter((glyph) => /\s/.test(glyph.character)).length
      const justifyGap = paragraph.textAlign === 'justify' && spaces > 0 && lineIndex < metrics.lines.length - 1 ? Math.max(0, availableWidth - lineWidth) / spaces : 0
      const baseY = -metrics.height / 2 + metrics.lineHeight / 2 + lineIndex * metrics.lineHeight + (paragraph.spaceBefore ?? 0)
      glyphs.forEach((glyph) => {
        setTextStyle(context, layer, glyph.style)
        context.fillStyle = glyph.style.color
        const progress = metrics.width ? (x + metrics.width / 2) / metrics.width : 0.5
        const warp = layer.warp ? textWarpOffset(layer.warp.style, progress, layer.warp.value, layer.warp.perspective, metrics.height) : 0
        const y = baseY + warp - (glyph.style.baselineShift ?? 0)
        context.save()
        context.translate(x, y)
        context.scale((glyph.style.horizontalScale ?? 100) / 100, (glyph.style.verticalScale ?? 100) / 100)
        context.fillText(glyph.character, 0, 0)
        if (glyph.style.underline || glyph.style.strikethrough) {
          context.strokeStyle = glyph.style.color
          context.lineWidth = Math.max(1, glyph.style.fontSize / 18)
          const decorationY = glyph.style.underline ? glyph.style.fontSize * 0.42 : 0
          context.beginPath()
          context.moveTo(0, decorationY)
          context.lineTo(glyph.width, decorationY)
          context.stroke()
        }
        context.restore()
        x += glyph.width + (/\s/.test(glyph.character) ? justifyGap : 0)
      })
    })
  })
  context.globalAlpha = 1
}

function shapeBounds(canvas: HTMLCanvasElement, layer: ShapeLayer): LayerBounds {
  const width = canvas.width * (layer.width / 100)
  const height = canvas.height * (layer.height / 100)
  return {
    x: canvas.width / 2 - width / 2 + layer.position.x * canvas.width,
    y: canvas.height / 2 - height / 2 + layer.position.y * canvas.height,
    width,
    height,
    rotation: layer.rotation,
  }
}

function traceShapePath(context: CanvasRenderingContext2D, path: NonNullable<ShapeLayer['vectorPaths']>[number], width: number, height: number, offsetX = 0, offsetY = 0) {
  const first = path.knots[0]
  if (!first) return
  const point = (position: Position) => ({ x: offsetX + position.x * width, y: offsetY + position.y * height })
  const firstAnchor = point(first.anchor)
  context.beginPath()
  context.moveTo(firstAnchor.x, firstAnchor.y)
  for (let index = 1; index < path.knots.length; index += 1) {
    const previous = path.knots[index - 1]
    const current = path.knots[index]
    const controlA = point(previous.out)
    const controlB = point(current.in)
    const anchor = point(current.anchor)
    context.bezierCurveTo(controlA.x, controlA.y, controlB.x, controlB.y, anchor.x, anchor.y)
  }
  if (path.closed) {
    const previous = path.knots.at(-1)!
    const controlA = point(previous.out)
    const controlB = point(first.in)
    context.bezierCurveTo(controlA.x, controlA.y, controlB.x, controlB.y, firstAnchor.x, firstAnchor.y)
    context.closePath()
  }
}

function shapePattern(context: CanvasRenderingContext2D, layer: ShapeLayer) {
  if (layer.fillStyle?.type !== 'pattern') return null
  const tile = document.createElement('canvas')
  const size = Math.max(6, Math.round(16 * layer.fillStyle.scale / 100))
  tile.width = size
  tile.height = size
  const tileContext = tile.getContext('2d')
  if (!tileContext) return null
  tileContext.fillStyle = layer.fill
  tileContext.fillRect(0, 0, size, size)
  tileContext.strokeStyle = layer.stroke
  tileContext.fillStyle = layer.stroke
  tileContext.globalAlpha = 0.65
  const key = `${layer.fillStyle.id} ${layer.fillStyle.name}`.toLowerCase()
  if (key.includes('dot')) {
    tileContext.beginPath()
    tileContext.arc(size / 2, size / 2, Math.max(1, size / 7), 0, Math.PI * 2)
    tileContext.fill()
  } else if (key.includes('grid')) {
    tileContext.beginPath()
    tileContext.moveTo(0, 0)
    tileContext.lineTo(size, 0)
    tileContext.moveTo(0, 0)
    tileContext.lineTo(0, size)
    tileContext.stroke()
  } else {
    tileContext.beginPath()
    tileContext.moveTo(-size / 2, size)
    tileContext.lineTo(size / 2, 0)
    tileContext.moveTo(size / 2, size)
    tileContext.lineTo(size * 1.5, 0)
    tileContext.stroke()
  }
  return context.createPattern(tile, 'repeat')
}

function setShapeFill(context: CanvasRenderingContext2D, layer: ShapeLayer, width: number, height: number, centerX: number, centerY: number) {
  if (layer.fillStyle?.type === 'gradient') {
    const angle = layer.fillStyle.angle * Math.PI / 180
    const radius = Math.abs(width * Math.cos(angle)) / 2 + Math.abs(height * Math.sin(angle)) / 2
    const gradient = layer.fillStyle.style === 'radial'
      ? context.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(width, height) / 2 * layer.fillStyle.scale / 100)
      : context.createLinearGradient(centerX - Math.cos(angle) * radius, centerY - Math.sin(angle) * radius, centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius)
    for (const stop of layer.fillStyle.colorStops) gradient.addColorStop(Math.max(0, Math.min(1, stop.position)), stop.color)
    context.fillStyle = gradient
  } else if (layer.fillStyle?.type === 'pattern') context.fillStyle = shapePattern(context, layer) ?? layer.fill
  else context.fillStyle = layer.fillStyle?.type === 'color' ? layer.fillStyle.color : layer.fill
}

function booleanPathMask(layer: ShapeLayer, width: number, height: number) {
  const mask = document.createElement('canvas')
  mask.width = Math.max(1, Math.ceil(width))
  mask.height = Math.max(1, Math.ceil(height))
  const context = mask.getContext('2d')
  if (!context) return null
  layer.vectorPaths?.forEach((path, index) => {
    context.globalCompositeOperation = index === 0 || path.operation === 'combine' ? 'source-over'
      : path.operation === 'subtract' ? 'destination-out'
        : path.operation === 'intersect' ? 'destination-in'
          : 'xor'
    traceShapePath(context, path, mask.width, mask.height)
    context.fillStyle = '#ffffff'
    context.fill(path.fillRule === 'even-odd' ? 'evenodd' : 'nonzero')
  })
  context.globalCompositeOperation = 'source-over'
  return mask
}

function drawBooleanShapePath(context: CanvasRenderingContext2D, layer: ShapeLayer, width: number, height: number, x: number, y: number) {
  const mask = booleanPathMask(layer, width, height)
  if (!mask) return
  if (layer.fill !== 'transparent' || layer.fillStyle) {
    const paint = document.createElement('canvas')
    paint.width = mask.width
    paint.height = mask.height
    const paintContext = paint.getContext('2d')
    if (paintContext) {
      setShapeFill(paintContext, layer, paint.width, paint.height, paint.width / 2, paint.height / 2)
      paintContext.fillRect(0, 0, paint.width, paint.height)
      paintContext.globalCompositeOperation = 'destination-in'
      paintContext.drawImage(mask, 0, 0)
      context.drawImage(paint, x, y, width, height)
    }
  }
  if (layer.strokeWidth <= 0) return
  const alignment = layer.strokeStyle?.alignment ?? 'center'
  const padding = Math.ceil(layer.strokeWidth * 2 + 2)
  const stroke = document.createElement('canvas')
  stroke.width = mask.width + padding * 2
  stroke.height = mask.height + padding * 2
  const strokeContext = stroke.getContext('2d')
  if (!strokeContext) return
  strokeContext.strokeStyle = layer.stroke
  strokeContext.lineWidth = alignment === 'center' ? layer.strokeWidth : layer.strokeWidth * 2
  strokeContext.lineCap = layer.strokeStyle?.cap ?? 'butt'
  strokeContext.lineJoin = layer.strokeStyle?.join ?? 'miter'
  strokeContext.miterLimit = layer.strokeStyle?.miterLimit ?? 10
  strokeContext.setLineDash(layer.strokeStyle?.dashes ?? [])
  strokeContext.lineDashOffset = layer.strokeStyle?.dashOffset ?? 0
  for (const path of layer.vectorPaths ?? []) {
    traceShapePath(strokeContext, path, mask.width, mask.height, padding, padding)
    strokeContext.stroke()
  }
  if (alignment !== 'center') {
    strokeContext.globalCompositeOperation = alignment === 'inside' ? 'destination-in' : 'destination-out'
    strokeContext.drawImage(mask, padding, padding)
  }
  context.save()
  context.globalAlpha *= layer.strokeStyle?.opacity ?? 1
  context.globalCompositeOperation = layer.strokeStyle?.blendMode === 'normal' || !layer.strokeStyle?.blendMode ? 'source-over' : layer.strokeStyle.blendMode
  context.drawImage(stroke, x - padding, y - padding, width + padding * 2, height + padding * 2)
  context.restore()
}

function drawShapeLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: ShapeLayer) {
  const bounds = shapeBounds(canvas, layer)
  context.globalAlpha = layer.opacity / 100
  withLayerTransform(context, bounds, Boolean(layer.flipX), Boolean(layer.flipY), () => {
    const x = -bounds.width / 2
    const y = -bounds.height / 2
    if (layer.shape === 'path' && layer.vectorPaths?.length) {
      drawBooleanShapePath(context, layer, bounds.width, bounds.height, x, y)
      return
    }
    context.beginPath()
    if (layer.shape === 'ellipse') context.ellipse(0, 0, bounds.width / 2, bounds.height / 2, 0, 0, Math.PI * 2)
    else context.roundRect(x, y, bounds.width, bounds.height, Math.min(layer.cornerRadius, bounds.width / 2, bounds.height / 2))
    setShapeFill(context, layer, bounds.width, bounds.height, 0, 0)
    context.fill()
    if (layer.strokeWidth > 0) {
      context.strokeStyle = layer.stroke
      context.lineWidth = layer.strokeWidth
      context.lineCap = layer.strokeStyle?.cap ?? 'butt'
      context.lineJoin = layer.strokeStyle?.join ?? 'miter'
      context.miterLimit = layer.strokeStyle?.miterLimit ?? 10
      context.setLineDash(layer.strokeStyle?.dashes ?? [])
      context.lineDashOffset = layer.strokeStyle?.dashOffset ?? 0
      context.globalAlpha *= layer.strokeStyle?.opacity ?? 1
      context.stroke()
    }
  })
  context.globalAlpha = 1
}

function drawEditorLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: EditorLayer, assets: AssetMap, resources: RenderResourceRegistry) {
  if (layer.type === 'image') drawImageLayer(context, canvas, layer, assets, resources)
  else if (layer.type === 'raster') drawRasterLayer(context, canvas, layer, assets, resources)
  else if (layer.type === 'smart-object') drawSmartObjectLayer(context, canvas, layer, assets, resources)
  else if (layer.type === 'text') drawTextLayer(context, canvas, layer)
  else if (layer.type === 'shape') drawShapeLayer(context, canvas, layer)
}

let geometryLayerCanvas: HTMLCanvasElement | null = null

function affineTriangle(context: CanvasRenderingContext2D, source: HTMLCanvasElement, sourcePoints: [Position, Position, Position], destination: [Position, Position, Position]) {
  const [s0, s1, s2] = sourcePoints
  const [d0, d1, d2] = destination
  const denominator = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y)
  if (Math.abs(denominator) < 0.0001) return
  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denominator
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denominator
  const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / denominator
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denominator
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denominator
  const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / denominator
  context.save()
  context.beginPath()
  context.moveTo(d0.x, d0.y)
  context.lineTo(d1.x, d1.y)
  context.lineTo(d2.x, d2.y)
  context.closePath()
  context.clip()
  context.transform(a, b, c, d, e, f)
  context.drawImage(source, 0, 0)
  context.restore()
}

function drawGeometryTransformedLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: EditorLayer, assets: AssetMap, resources: RenderResourceRegistry) {
  if (geometryTransformIsIdentity(layer.geometryTransform)) {
    drawEditorLayer(context, canvas, layer, assets, resources)
    return
  }
  const bounds = getLayerBounds(context, canvas, layer, assets)
  if (!bounds) return
  geometryLayerCanvas = prepareScratchCanvas(geometryLayerCanvas, canvas)
  const sourceContext = geometryLayerCanvas.getContext('2d')
  if (!sourceContext) return
  sourceContext.clearRect(0, 0, canvas.width, canvas.height)
  drawEditorLayer(sourceContext, geometryLayerCanvas, layer, assets, resources)
  const mesh = geometryMesh(layer.geometryTransform)
  const angle = bounds.rotation * Math.PI / 180
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  const world = (point: Position) => {
    const x = (point.x - 0.5) * bounds.width
    const y = (point.y - 0.5) * bounds.height
    return { x: center.x + x * Math.cos(angle) - y * Math.sin(angle), y: center.y + x * Math.sin(angle) + y * Math.cos(angle) }
  }
  const source = mesh.source.map(world)
  const destination = mesh.destination.map(world)
  context.imageSmoothingEnabled = layer.geometryTransform?.interpolation !== 'nearest'
  context.imageSmoothingQuality = layer.geometryTransform?.interpolation === 'bicubic' ? 'high' : 'medium'
  for (let row = 0; row < mesh.rows - 1; row += 1) for (let column = 0; column < mesh.columns - 1; column += 1) {
    const topLeft = row * mesh.columns + column
    const topRight = topLeft + 1
    const bottomLeft = topLeft + mesh.columns
    const bottomRight = bottomLeft + 1
    affineTriangle(context, geometryLayerCanvas, [source[topLeft], source[topRight], source[bottomRight]], [destination[topLeft], destination[topRight], destination[bottomRight]])
    affineTriangle(context, geometryLayerCanvas, [source[topLeft], source[bottomRight], source[bottomLeft]], [destination[topLeft], destination[bottomRight], destination[bottomLeft]])
  }
}

let maskCompositionCanvas: HTMLCanvasElement | null = null
let processedMaskCanvas: HTMLCanvasElement | null = null
let vectorMaskCanvas: HTMLCanvasElement | null = null

function mutateCanvasStripes(context: CanvasRenderingContext2D, canvas: Pick<HTMLCanvasElement, 'width' | 'height'>, mutate: (pixels: ImageData) => void) {
  const rowsPerStripe = Math.max(1, Math.floor((4 * 1024 * 1024) / Math.max(4, canvas.width * 4)))
  for (let y = 0; y < canvas.height; y += rowsPerStripe) {
    const height = Math.min(rowsPerStripe, canvas.height - y)
    const pixels = context.getImageData(0, y, canvas.width, height)
    mutate(pixels)
    context.putImageData(pixels, 0, y)
  }
}

function traceVectorMaskPath(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, path: NonNullable<EditorLayer['vectorMask']>['paths'][number]) {
  const first = path.knots[0]
  if (!first) return
  const point = (position: Position) => ({ x: position.x * canvas.width, y: position.y * canvas.height })
  const firstAnchor = point(first.anchor)
  context.beginPath()
  context.moveTo(firstAnchor.x, firstAnchor.y)
  for (let index = 1; index < path.knots.length; index += 1) {
    const previous = path.knots[index - 1]
    const current = path.knots[index]
    const controlA = point(previous.out)
    const controlB = point(current.in)
    const anchor = point(current.anchor)
    context.bezierCurveTo(controlA.x, controlA.y, controlB.x, controlB.y, anchor.x, anchor.y)
  }
  if (path.closed) {
    const previous = path.knots.at(-1)!
    const controlA = point(previous.out)
    const controlB = point(first.in)
    context.bezierCurveTo(controlA.x, controlA.y, controlB.x, controlB.y, firstAnchor.x, firstAnchor.y)
    context.closePath()
  }
}

function applyMaskDensity(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, density: number) {
  const amount = Math.max(0, Math.min(1, density / 100))
  if (amount >= 1) return
  mutateCanvasStripes(context, canvas, (pixels) => {
    for (let index = 3; index < pixels.data.length; index += 4) pixels.data[index] = Math.round((1 - amount) * 255 + amount * pixels.data[index])
  })
}

function preparedRasterMask(canvas: HTMLCanvasElement, source: CanvasImageSource, layer: EditorLayer) {
  const mask = prepareScratchCanvas(processedMaskCanvas, canvas)
  processedMaskCanvas = mask
  const context = mask.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.clearRect(0, 0, mask.width, mask.height)
  context.save()
  const feather = Math.max(0, layer.maskSettings?.feather ?? 0)
  if (feather) context.filter = `blur(${feather}px)`
  context.drawImage(source, 0, 0, mask.width, mask.height)
  context.restore()
  applyMaskDensity(context, mask, layer.maskSettings?.density ?? 100)
  return mask
}

function preparedVectorMask(canvas: HTMLCanvasElement, layer: EditorLayer) {
  const settings = layer.vectorMask
  if (!settings || settings.disabled || settings.paths.length === 0) return null
  const mask = prepareScratchCanvas(vectorMaskCanvas, canvas)
  vectorMaskCanvas = mask
  const context = mask.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.clearRect(0, 0, mask.width, mask.height)
  if (settings.fillStartsWithAllPixels) {
    context.fillStyle = '#fff'
    context.fillRect(0, 0, mask.width, mask.height)
  }
  context.fillStyle = '#fff'
  for (const path of settings.paths) {
    traceVectorMaskPath(context, mask, path)
    context.globalCompositeOperation = path.operation === 'subtract'
      ? 'destination-out'
      : path.operation === 'intersect'
        ? 'destination-in'
        : path.operation === 'exclude'
          ? 'xor'
          : 'source-over'
    context.fill(path.fillRule === 'even-odd' ? 'evenodd' : 'nonzero')
  }
  context.globalCompositeOperation = 'source-over'
  if (settings.inverted) {
    mutateCanvasStripes(context, mask, (pixels) => {
      for (let index = 3; index < pixels.data.length; index += 4) pixels.data[index] = 255 - pixels.data[index]
    })
  }
  if (settings.feather > 0) {
    const snapshot = document.createElement('canvas')
    snapshot.width = mask.width
    snapshot.height = mask.height
    snapshot.getContext('2d')?.drawImage(mask, 0, 0)
    context.clearRect(0, 0, mask.width, mask.height)
    context.filter = `blur(${settings.feather}px)`
    context.drawImage(snapshot, 0, 0)
    context.filter = 'none'
  }
  applyMaskDensity(context, mask, settings.density)
  return mask
}

function blendIfOpacity(value: number, range: number[]) {
  if (range.length < 4) return 1
  const [black0, black1, white0, white1] = range
  if (value < black0 || value > white1) return 0
  if (black1 > black0 && value <= black0) return 0
  if (black1 > black0 && value < black1) return (value - black0) / (black1 - black0)
  if (white1 > white0 && value >= white1) return 0
  if (white1 > white0 && value > white0) return (white1 - value) / (white1 - white0)
  return 1
}

function applyBlendIf(layerContext: CanvasRenderingContext2D, destinationContext: CanvasRenderingContext2D, layer: EditorLayer, region: RasterRegion | null) {
  const settings = layer.blendIf
  if (!settings || !region) return
  const source = layerContext.getImageData(region.x, region.y, region.width, region.height)
  const destination = destinationContext.getImageData(region.x, region.y, region.width, region.height)
  for (let index = 0; index < source.data.length; index += 4) {
    const sourceGray = Math.round(source.data[index] * 0.299 + source.data[index + 1] * 0.587 + source.data[index + 2] * 0.114)
    const destinationGray = Math.round(destination.data[index] * 0.299 + destination.data[index + 1] * 0.587 + destination.data[index + 2] * 0.114)
    let opacity = blendIfOpacity(sourceGray, settings.source) * blendIfOpacity(destinationGray, settings.destination)
    for (let channel = 0; channel < Math.min(3, settings.channels.length); channel += 1) {
      opacity *= blendIfOpacity(source.data[index + channel], settings.channels[channel].source)
      opacity *= blendIfOpacity(destination.data[index + channel], settings.channels[channel].destination)
    }
    source.data[index + 3] = Math.round(source.data[index + 3] * opacity)
  }
  layerContext.putImageData(source, region.x, region.y)
}

export function filterGraphRasterRegion(canvas: Pick<HTMLCanvasElement, 'width' | 'height'>, bounds: LayerBounds, filterGraph: FilterGraphNode[]): RasterRegion | null {
  const angle = bounds.rotation * Math.PI / 180
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const points = [
    [-bounds.width / 2, -bounds.height / 2],
    [bounds.width / 2, -bounds.height / 2],
    [bounds.width / 2, bounds.height / 2],
    [-bounds.width / 2, bounds.height / 2],
  ].map(([x, y]) => ({ x: centerX + x * Math.cos(angle) - y * Math.sin(angle), y: centerY + x * Math.sin(angle) + y * Math.cos(angle) }))
  const padding = 2 + normalizeFilterGraph(filterGraph).reduce((total, node) => total + (node.kind === 'gaussian-blur' ? node.size * 3 : node.kind === 'pixelate' || node.kind === 'emboss' ? node.size : node.kind === 'wave' ? node.amount / 5 : 0), 0)
  const x = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x)) - padding))
  const y = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y)) - padding))
  const right = Math.min(canvas.width, Math.ceil(Math.max(...points.map((point) => point.x)) + padding))
  const bottom = Math.min(canvas.height, Math.ceil(Math.max(...points.map((point) => point.y)) + padding))
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

function drawMaskedLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: EditorLayer, maskAssetId: string | null, assets: AssetMap, resources: RenderResourceRegistry) {
  const maskSource = maskAssetId ? canvasImageResource(resources, assets, maskAssetId)?.source : null
  const filterGraph = layer.filterGraphEnabled === false ? [] : normalizeFilterGraph(layer.filterGraph).filter((node) => node.enabled)
  if (!maskSource && !layer.vectorMask && !layer.blendIf && filterGraph.length === 0) {
    drawGeometryTransformedLayer(context, canvas, layer, assets, resources)
    return
  }

  const composition = maskCompositionCanvas ?? document.createElement('canvas')
  maskCompositionCanvas = composition
  if (composition.width !== canvas.width) composition.width = canvas.width
  if (composition.height !== canvas.height) composition.height = canvas.height
  const compositionContext = composition.getContext('2d')
  if (!compositionContext) return
  compositionContext.clearRect(0, 0, composition.width, composition.height)
  drawGeometryTransformedLayer(compositionContext, composition, layer, assets, resources)
  const bounds = getLayerBounds(compositionContext, canvas, layer, assets)
  const rasterRegion = !bounds
    ? null
    : geometryTransformIsIdentity(layer.geometryTransform)
      ? filterGraphRasterRegion(canvas, bounds, filterGraph)
      : { x: 0, y: 0, width: canvas.width, height: canvas.height }
  if (filterGraph.length) {
    const originalCanvas = prepareScratchCanvas(filterGraphOriginalCanvas, canvas)
    filterGraphOriginalCanvas = originalCanvas
    const originalContext = originalCanvas.getContext('2d')
    originalContext?.clearRect(0, 0, canvas.width, canvas.height)
    originalContext?.drawImage(composition, 0, 0)
    const blur = Math.max(0, ...filterGraph.filter((node) => node.kind === 'gaussian-blur').map((node) => node.size))
    if (blur > 0) {
      filterGraphBlurCanvas = prepareScratchCanvas(filterGraphBlurCanvas, canvas)
      const blurContext = filterGraphBlurCanvas.getContext('2d')
      if (blurContext) {
        blurContext.clearRect(0, 0, canvas.width, canvas.height)
        blurContext.filter = `blur(${blur}px)`
        blurContext.drawImage(composition, 0, 0)
        blurContext.filter = 'none'
        compositionContext.clearRect(0, 0, canvas.width, canvas.height)
        compositionContext.drawImage(filterGraphBlurCanvas, 0, 0)
      }
    }
    if (rasterRegion) {
      const pixels = compositionContext.getImageData(rasterRegion.x, rasterRegion.y, rasterRegion.width, rasterRegion.height)
      compositionContext.putImageData(applyPixelFilterGraph(pixels, filterGraph, { x: rasterRegion.x, y: rasterRegion.y }), rasterRegion.x, rasterRegion.y)
    }
    const filterMask = layer.filterMaskAssetId ? canvasImageResource(resources, assets, layer.filterMaskAssetId)?.source : null
    if (filterMask && originalContext) {
      const prepared = preparedRasterMask(canvas, filterMask, layer)
      if (prepared) {
        compositionContext.save()
        compositionContext.globalCompositeOperation = 'destination-in'
        compositionContext.drawImage(prepared, 0, 0)
        compositionContext.restore()
        originalContext.drawImage(composition, 0, 0)
        compositionContext.clearRect(0, 0, canvas.width, canvas.height)
        compositionContext.drawImage(originalCanvas, 0, 0)
      }
    }
  }
  for (const mask of [
    maskSource ? preparedRasterMask(canvas, maskSource, layer) : null,
    preparedVectorMask(canvas, layer),
  ]) {
    if (!mask) continue
    compositionContext.save()
    compositionContext.globalAlpha = 1
    compositionContext.globalCompositeOperation = 'destination-in'
    compositionContext.drawImage(mask, 0, 0, composition.width, composition.height)
    compositionContext.restore()
  }
  applyBlendIf(compositionContext, context, layer, rasterRegion)
  context.drawImage(composition, 0, 0)
}

let clippedLayerCanvas: HTMLCanvasElement | null = null
let clippingBaseCanvas: HTMLCanvasElement | null = null
let adjustmentCanvas: HTMLCanvasElement | null = null
let layerEffectsCanvas: HTMLCanvasElement | null = null
let layerEffectPassCanvas: HTMLCanvasElement | null = null
let colorOverlayCanvas: HTMLCanvasElement | null = null
let strokeEffectsCanvas: HTMLCanvasElement | null = null
let filterGraphBlurCanvas: HTMLCanvasElement | null = null
let filterGraphOriginalCanvas: HTMLCanvasElement | null = null

function prepareScratchCanvas(current: HTMLCanvasElement | null, canvas: HTMLCanvasElement) {
  const scratch = current ?? document.createElement('canvas')
  if (scratch.width !== canvas.width) scratch.width = canvas.width
  if (scratch.height !== canvas.height) scratch.height = canvas.height
  return scratch
}

function drawTintedEffect(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  source: HTMLCanvasElement,
  color: string,
  opacity: number,
  blur: number,
  offsetX = 0,
  offsetY = 0,
  blendMode: BlendMode = 'normal',
) {
  layerEffectPassCanvas = prepareScratchCanvas(layerEffectPassCanvas, canvas)
  const effectContext = layerEffectPassCanvas.getContext('2d')
  if (!effectContext) return
  effectContext.clearRect(0, 0, canvas.width, canvas.height)
  effectContext.save()
  effectContext.filter = blur > 0 ? `blur(${blur}px)` : 'none'
  effectContext.drawImage(source, offsetX, offsetY)
  effectContext.restore()
  effectContext.save()
  effectContext.globalCompositeOperation = 'source-in'
  effectContext.globalAlpha = opacity / 100
  effectContext.fillStyle = color
  effectContext.fillRect(0, 0, canvas.width, canvas.height)
  effectContext.restore()
  context.save()
  context.globalCompositeOperation = blendMode === 'normal' ? 'source-over' : blendMode
  context.drawImage(layerEffectPassCanvas, 0, 0)
  context.restore()
}

function drawInnerTintedEffect(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, source: HTMLCanvasElement, color: string, opacity: number, blur: number, offsetX: number, offsetY: number, blendMode: BlendMode) {
  layerEffectPassCanvas = prepareScratchCanvas(layerEffectPassCanvas, canvas)
  const effectContext = layerEffectPassCanvas.getContext('2d')
  if (!effectContext) return
  effectContext.clearRect(0, 0, canvas.width, canvas.height)
  effectContext.save()
  effectContext.filter = blur > 0 ? `blur(${blur}px)` : 'none'
  effectContext.drawImage(source, offsetX, offsetY)
  effectContext.restore()
  effectContext.globalCompositeOperation = 'source-in'
  effectContext.globalAlpha = opacity / 100
  effectContext.fillStyle = color
  effectContext.fillRect(0, 0, canvas.width, canvas.height)
  effectContext.globalCompositeOperation = 'destination-in'
  effectContext.globalAlpha = 1
  effectContext.drawImage(source, 0, 0)
  effectContext.globalCompositeOperation = 'source-over'
  context.save()
  context.globalCompositeOperation = blendMode === 'normal' ? 'source-over' : blendMode
  context.drawImage(layerEffectPassCanvas, 0, 0)
  context.restore()
}

function applyGradientOverlay(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, effects: LayerEffects['gradientOverlay']) {
  const angle = effects.angle * Math.PI / 180
  const radius = Math.abs(canvas.width * Math.cos(angle)) / 2 + Math.abs(canvas.height * Math.sin(angle)) / 2
  const gradient = effects.style === 'radial'
    ? context.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 2 * effects.scale / 100)
    : context.createLinearGradient(canvas.width / 2 - Math.cos(angle) * radius, canvas.height / 2 - Math.sin(angle) * radius, canvas.width / 2 + Math.cos(angle) * radius, canvas.height / 2 + Math.sin(angle) * radius)
  let stops = effects.reverse ? [...effects.colorStops].reverse().map((stop) => ({ ...stop, position: 1 - stop.position })) : effects.colorStops
  if (effects.gradientType === 'noise') {
    let seed = effects.randomSeed >>> 0 || 1
    const random = () => {
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      return (seed >>> 0) / 0xffffffff
    }
    const count = Math.max(8, Math.min(64, Math.round(8 + effects.roughness / 2)))
    const channel = (index: number) => {
      const minimum = effects.min[index] ?? 0
      const maximum = effects.max[index] ?? 1
      const value = minimum + (maximum - minimum) * random()
      return Math.round(Math.max(0, Math.min(255, value <= 1 ? value * 255 : value)))
    }
    stops = Array.from({ length: count }, (_, index) => ({
      position: index / (count - 1),
      color: `rgb(${channel(0)} ${channel(1)} ${channel(2)})`,
    }))
    if (effects.reverse) stops.reverse().forEach((stop, index) => { stop.position = index / (count - 1) })
  }
  for (const stop of stops) gradient.addColorStop(Math.max(0, Math.min(1, stop.position)), stop.color)
  context.save()
  context.globalCompositeOperation = effects.blendMode === 'normal' ? 'source-atop' : effects.blendMode
  context.globalAlpha = effects.opacity / 100
  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.restore()
}

function applyPatternOverlay(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, effects: LayerEffects['patternOverlay']) {
  const tile = document.createElement('canvas')
  const size = Math.max(4, Math.round(12 * effects.scale / 100))
  tile.width = size * 2
  tile.height = size * 2
  const tileContext = tile.getContext('2d')
  if (!tileContext) return
  tileContext.fillStyle = '#fff'
  tileContext.fillRect(0, 0, tile.width, tile.height)
  tileContext.fillStyle = '#b4b4b4'
  tileContext.fillRect(0, 0, size, size)
  tileContext.fillRect(size, size, size, size)
  const pattern = context.createPattern(tile, 'repeat')
  if (!pattern) return
  context.save()
  context.globalCompositeOperation = effects.blendMode === 'normal' ? 'source-atop' : effects.blendMode
  context.globalAlpha = effects.opacity / 100
  context.translate(effects.phase.x, effects.phase.y)
  context.fillStyle = pattern
  context.fillRect(-effects.phase.x, -effects.phase.y, canvas.width, canvas.height)
  context.restore()
}

function drawStrokeEffect(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, source: HTMLCanvasElement, stroke: LayerEffects['stroke'], inner: boolean) {
  strokeEffectsCanvas = prepareScratchCanvas(strokeEffectsCanvas, canvas)
  const strokeContext = strokeEffectsCanvas.getContext('2d')
  if (!strokeContext) return
  strokeContext.clearRect(0, 0, canvas.width, canvas.height)
  if (inner) drawInnerTintedEffect(strokeContext, canvas, source, '#ffffff', 100, stroke.size / 2, 0, 0, 'normal')
  else drawTintedEffect(strokeContext, canvas, source, '#ffffff', 100, stroke.size / (stroke.position === 'center' ? 2 : 1), 0, 0, 'normal')
  if (stroke.fillType === 'gradient') {
    applyGradientOverlay(strokeContext, canvas, { ...stroke.gradient, enabled: true, opacity: 100, blendMode: 'normal' })
  } else if (stroke.fillType === 'pattern') {
    applyPatternOverlay(strokeContext, canvas, { ...stroke.pattern, enabled: true, opacity: 100, blendMode: 'normal' })
  } else {
    strokeContext.save()
    strokeContext.globalCompositeOperation = 'source-in'
    strokeContext.fillStyle = stroke.color
    strokeContext.fillRect(0, 0, canvas.width, canvas.height)
    strokeContext.restore()
  }
  context.save()
  context.globalCompositeOperation = stroke.blendMode === 'normal' ? 'source-over' : stroke.blendMode
  context.globalAlpha = stroke.opacity / 100
  context.drawImage(strokeEffectsCanvas, 0, 0)
  context.restore()
}

function drawLayerWithEffects(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  effects: LayerEffects | null,
  additionalEffects: LayerEffects[],
  draw: (target: CanvasRenderingContext2D) => void,
) {
  const effectStack = [...(effects ? [effects] : []), ...additionalEffects]
  if (!effectStack.length) {
    draw(context)
    return
  }
  layerEffectsCanvas = prepareScratchCanvas(layerEffectsCanvas, canvas)
  const layerContext = layerEffectsCanvas.getContext('2d')
  if (!layerContext) return
  layerContext.clearRect(0, 0, canvas.width, canvas.height)
  draw(layerContext)

  for (const value of effectStack) {
    if (value.outerGlow.enabled) drawTintedEffect(context, canvas, layerEffectsCanvas, value.outerGlow.color, value.outerGlow.opacity, value.outerGlow.size, 0, 0, value.outerGlow.blendMode)
    if (value.dropShadow.enabled) {
      const angle = value.dropShadow.angle * Math.PI / 180
      drawTintedEffect(context, canvas, layerEffectsCanvas, value.dropShadow.color, value.dropShadow.opacity, value.dropShadow.blur, Math.cos(angle) * value.dropShadow.distance, Math.sin(angle) * value.dropShadow.distance, value.dropShadow.blendMode)
    }
    if (value.stroke.enabled && value.stroke.position !== 'inside') drawStrokeEffect(context, canvas, layerEffectsCanvas, value.stroke, false)
  }
  colorOverlayCanvas = prepareScratchCanvas(colorOverlayCanvas, canvas)
  const overlayContext = colorOverlayCanvas.getContext('2d')
  if (!overlayContext) return
  overlayContext.clearRect(0, 0, canvas.width, canvas.height)
  overlayContext.drawImage(layerEffectsCanvas, 0, 0)
  for (const value of effectStack) {
    if (value.colorOverlay.enabled) {
      overlayContext.save()
      overlayContext.globalCompositeOperation = value.colorOverlay.blendMode === 'normal' ? 'source-atop' : value.colorOverlay.blendMode
      overlayContext.globalAlpha = value.colorOverlay.opacity / 100
      overlayContext.fillStyle = value.colorOverlay.color
      overlayContext.fillRect(0, 0, canvas.width, canvas.height)
      overlayContext.restore()
    }
    if (value.gradientOverlay.enabled) applyGradientOverlay(overlayContext, canvas, value.gradientOverlay)
    if (value.patternOverlay.enabled) applyPatternOverlay(overlayContext, canvas, value.patternOverlay)
  }
  context.drawImage(colorOverlayCanvas, 0, 0)
  for (const value of effectStack) {
    if (value.innerShadow.enabled) {
      const angle = value.innerShadow.angle * Math.PI / 180
      drawInnerTintedEffect(context, canvas, layerEffectsCanvas, value.innerShadow.color, value.innerShadow.opacity, value.innerShadow.blur, Math.cos(angle) * value.innerShadow.distance, Math.sin(angle) * value.innerShadow.distance, value.innerShadow.blendMode)
    }
    if (value.innerGlow.enabled) drawInnerTintedEffect(context, canvas, layerEffectsCanvas, value.innerGlow.color, value.innerGlow.opacity, value.innerGlow.size, 0, 0, value.innerGlow.blendMode)
    if (value.satin.enabled) {
      const angle = value.satin.angle * Math.PI / 180
      const direction = value.satin.invert ? -1 : 1
      drawInnerTintedEffect(context, canvas, layerEffectsCanvas, value.satin.color, value.satin.opacity, value.satin.size, Math.cos(angle) * value.satin.distance * direction, Math.sin(angle) * value.satin.distance * direction, value.satin.blendMode)
    }
    if (value.bevel.enabled) {
      const angle = value.bevel.angle * Math.PI / 180
      const distance = Math.max(1, value.bevel.size * value.bevel.depth / 100 / 2) * (value.bevel.direction === 'down' ? -1 : 1)
      drawInnerTintedEffect(context, canvas, layerEffectsCanvas, value.bevel.highlightColor, value.bevel.highlightOpacity, value.bevel.size / 3, -Math.cos(angle) * distance, -Math.sin(angle) * distance, 'screen')
      drawInnerTintedEffect(context, canvas, layerEffectsCanvas, value.bevel.shadowColor, value.bevel.shadowOpacity, value.bevel.size / 3, Math.cos(angle) * distance, Math.sin(angle) * distance, 'multiply')
    }
    if (value.stroke.enabled && value.stroke.position === 'inside') drawStrokeEffect(context, canvas, layerEffectsCanvas, value.stroke, true)
  }
}

function drawClippedLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: EditorLayer, maskAssetId: string | null, base: EditorLayer, assets: AssetMap, resources: RenderResourceRegistry) {
  clippedLayerCanvas = prepareScratchCanvas(clippedLayerCanvas, canvas)
  clippingBaseCanvas = prepareScratchCanvas(clippingBaseCanvas, canvas)
  const layerContext = clippedLayerCanvas.getContext('2d')
  const baseContext = clippingBaseCanvas.getContext('2d')
  if (!layerContext || !baseContext) return
  layerContext.clearRect(0, 0, canvas.width, canvas.height)
  baseContext.clearRect(0, 0, canvas.width, canvas.height)
  drawMaskedLayer(layerContext, clippedLayerCanvas, layer, maskAssetId, assets, resources)
  drawMaskedLayer(baseContext, clippingBaseCanvas, base, base.maskAssetId ?? null, assets, resources)
  layerContext.save()
  layerContext.globalAlpha = 1
  layerContext.globalCompositeOperation = 'destination-in'
  layerContext.drawImage(clippingBaseCanvas, 0, 0)
  layerContext.restore()
  context.drawImage(clippedLayerCanvas, 0, 0)
}

function curveValue(value: number, points: Array<{ input: number; output: number }> | undefined) {
  if (!points?.length) return value
  const sorted = [...points].sort((left, right) => left.input - right.input)
  if (value <= sorted[0].input) return sorted[0].output
  for (let index = 1; index < sorted.length; index += 1) {
    const left = sorted[index - 1]
    const right = sorted[index]
    if (value <= right.input) return left.output + (right.output - left.output) * (value - left.input) / Math.max(1, right.input - left.input)
  }
  return sorted.at(-1)!.output
}

function levelValue(value: number, channel: Extract<AdjustmentDescriptor, { type: 'levels' }>['rgb']) {
  if (!channel) return value
  const normalized = Math.max(0, Math.min(1, (value - channel.shadowInput) / Math.max(1, channel.highlightInput - channel.shadowInput)))
  const gamma = Math.pow(normalized, 1 / Math.max(0.01, channel.midtoneInput))
  return channel.shadowOutput + gamma * (channel.highlightOutput - channel.shadowOutput)
}

function adjustmentColor(value: string) {
  return hexToRgba(value).slice(0, 3) as [number, number, number]
}

function gradientMapColor(value: number, adjustment: Extract<AdjustmentDescriptor, { type: 'gradient map' }>) {
  const stops = adjustment.colorStops?.slice().sort((left, right) => left.position - right.position)
  if (!stops?.length) return [value, value, value] as [number, number, number]
  const position = adjustment.reverse ? 1 - value / 255 : value / 255
  const rightIndex = stops.findIndex((stop) => stop.position >= position)
  if (rightIndex <= 0) return adjustmentColor(stops[Math.max(0, rightIndex)].color)
  const left = stops[rightIndex - 1]
  const right = stops[rightIndex]
  const amount = (position - left.position) / Math.max(0.0001, right.position - left.position)
  const leftColor = adjustmentColor(left.color)
  const rightColor = adjustmentColor(right.color)
  return leftColor.map((channel, index) => channel + (rightColor[index] - channel) * amount) as [number, number, number]
}

type CubeLut = {
  size: number
  values: Array<[number, number, number]>
  domainMin: [number, number, number]
  domainMax: [number, number, number]
  order: 'red-fastest' | 'blue-fastest'
  shaper?: number[]
}

function decodeLutText(adjustment: Extract<AdjustmentDescriptor, { type: 'color lookup' }>) {
  if (!adjustment.lut3DFileData?.length) return null
  let text: string
  try {
    text = new TextDecoder().decode(Uint8Array.from(adjustment.lut3DFileData))
  } catch {
    return null
  }
  return text.replace(/^\uFEFF/, '')
}

function parseCubeLut(adjustment: Extract<AdjustmentDescriptor, { type: 'color lookup' }>): CubeLut | null {
  if (adjustment.lutFormat !== 'cube') return null
  const text = decodeLutText(adjustment)
  if (!text) return null
  let size = 0
  let domainMin: [number, number, number] = [0, 0, 0]
  let domainMax: [number, number, number] = [1, 1, 1]
  const values: Array<[number, number, number]> = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('TITLE')) continue
    const parts = line.split(/\s+/)
    if (parts[0] === 'LUT_3D_SIZE') size = Number(parts[1])
    else if (parts[0] === 'DOMAIN_MIN') domainMin = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
    else if (parts[0] === 'DOMAIN_MAX') domainMax = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
    else if (parts.length >= 3 && parts.slice(0, 3).every((part) => Number.isFinite(Number(part)))) values.push([Number(parts[0]), Number(parts[1]), Number(parts[2])])
  }
  return size >= 2 && values.length >= size ** 3 ? { size, values, domainMin, domainMax, order: 'red-fastest' } : null
}

function likelyIntegerScale(maximum: number) {
  if (maximum <= 511) return 255
  if (maximum <= 2047) return 1023
  if (maximum <= 8191) return 4095
  return 65535
}

function parse3dlLut(adjustment: Extract<AdjustmentDescriptor, { type: 'color lookup' }>): CubeLut | null {
  if (adjustment.lutFormat !== '3dl') return null
  const text = decodeLutText(adjustment)
  if (!text) return null
  let rawShaper: number[] | undefined
  const rawValues: Array<[number, number, number]> = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('<')) continue
    const parts = line.split(/\s+/)
    if (!parts.every((part) => /^[-+]?\d+$/.test(part))) continue
    const numbers = parts.map(Number)
    if (numbers.length > 3 && !rawShaper) rawShaper = numbers
    else if (numbers.length === 3) rawValues.push(numbers as [number, number, number])
  }
  const size = Math.round(Math.cbrt(rawValues.length))
  if (size < 2 || size ** 3 !== rawValues.length) return null
  let maximum = Number.NEGATIVE_INFINITY
  for (const value of rawValues) maximum = Math.max(maximum, value[0], value[1], value[2])
  if (!Number.isFinite(maximum) || maximum < 128) return null
  const outputScale = likelyIntegerScale(maximum)
  const values = rawValues.map((value) => value.map((channel) => Math.max(0, Math.min(1, channel / outputScale))) as [number, number, number])
  let shaper: number[] | undefined
  if (rawShaper?.length && Math.max(...rawShaper) >= 128) {
    const shaperScale = likelyIntegerScale(Math.max(...rawShaper))
    shaper = rawShaper.map((value) => Math.max(0, Math.min(1, value / shaperScale)))
  }
  return { size, values, domainMin: [0, 0, 0], domainMax: [1, 1, 1], order: 'blue-fastest', shaper }
}

function parseLookLut(adjustment: Extract<AdjustmentDescriptor, { type: 'color lookup' }>): CubeLut | null {
  if (adjustment.lutFormat !== 'look') return null
  const text = decodeLutText(adjustment)
  if (!text) return null
  const sizeMatch = text.match(/<size>\s*["']?(\d+)["']?\s*<\/size>/i)
  const dataMatch = text.match(/<data>([\s\S]*?)<\/data>/i)
  const size = Number(sizeMatch?.[1] ?? 0)
  const hex = dataMatch?.[1].replace(/[\s"']/g, '') ?? ''
  const valueCount = size ** 3 * 3
  if (size < 2 || hex.length !== valueCount * 8 || !/^[0-9a-f]+$/i.test(hex)) return null
  const values: Array<[number, number, number]> = []
  const bytes = new Uint8Array(4)
  const view = new DataView(bytes.buffer)
  for (let valueIndex = 0; valueIndex < valueCount; valueIndex += 3) {
    const value: number[] = []
    for (let channel = 0; channel < 3; channel += 1) {
      const offset = (valueIndex + channel) * 8
      for (let byte = 0; byte < 4; byte += 1) bytes[byte] = Number.parseInt(hex.slice(offset + byte * 2, offset + byte * 2 + 2), 16)
      value.push(view.getFloat32(0, true))
    }
    values.push(value as [number, number, number])
  }
  return { size, values, domainMin: [0, 0, 0], domainMax: [1, 1, 1], order: 'red-fastest' }
}

export function parseColorLookupLut(adjustment: Extract<AdjustmentDescriptor, { type: 'color lookup' }>) {
  if (adjustment.iccPreview && adjustment.iccPreview.size >= 2 && adjustment.iccPreview.data.length >= adjustment.iccPreview.size ** 3 * 3) {
    const values: Array<[number, number, number]> = []
    for (let offset = 0; offset < adjustment.iccPreview.size ** 3 * 3; offset += 3) values.push([
      adjustment.iccPreview.data[offset] / 255,
      adjustment.iccPreview.data[offset + 1] / 255,
      adjustment.iccPreview.data[offset + 2] / 255,
    ])
    return { size: adjustment.iccPreview.size, values, domainMin: [0, 0, 0], domainMax: [1, 1, 1], order: 'red-fastest' } satisfies CubeLut
  }
  return parseCubeLut(adjustment) ?? parse3dlLut(adjustment) ?? parseLookLut(adjustment)
}

function sampleCubeLut(lut: CubeLut, red: number, green: number, blue: number) {
  const input = [red, green, blue].map((channel, index) => {
    const normalized = Math.max(0, Math.min(1, (channel / 255 - lut.domainMin[index]) / Math.max(0.000001, lut.domainMax[index] - lut.domainMin[index])))
    if (!lut.shaper?.length) return normalized
    const scaled = normalized * (lut.shaper.length - 1)
    const low = Math.floor(scaled)
    const high = Math.min(lut.shaper.length - 1, low + 1)
    return lut.shaper[low] + (lut.shaper[high] - lut.shaper[low]) * (scaled - low)
  })
  const scaled = input.map((value) => value * (lut.size - 1))
  const low = scaled.map(Math.floor)
  const high = low.map((value) => Math.min(lut.size - 1, value + 1))
  const fraction = scaled.map((value, index) => value - low[index])
  const at = (r: number, g: number, b: number) => lut.order === 'red-fastest'
    ? lut.values[r + g * lut.size + b * lut.size * lut.size]
    : lut.values[b + g * lut.size + r * lut.size * lut.size]
  const output = [0, 1, 2].map((channel) => {
    const c000 = at(low[0], low[1], low[2])[channel]
    const c100 = at(high[0], low[1], low[2])[channel]
    const c010 = at(low[0], high[1], low[2])[channel]
    const c110 = at(high[0], high[1], low[2])[channel]
    const c001 = at(low[0], low[1], high[2])[channel]
    const c101 = at(high[0], low[1], high[2])[channel]
    const c011 = at(low[0], high[1], high[2])[channel]
    const c111 = at(high[0], high[1], high[2])[channel]
    const x00 = c000 + (c100 - c000) * fraction[0]
    const x10 = c010 + (c110 - c010) * fraction[0]
    const x01 = c001 + (c101 - c001) * fraction[0]
    const x11 = c011 + (c111 - c011) * fraction[0]
    const y0 = x00 + (x10 - x00) * fraction[1]
    const y1 = x01 + (x11 - x01) * fraction[1]
    return (y0 + (y1 - y0) * fraction[2]) * 255
  })
  return output as [number, number, number]
}

function applyAdvancedAdjustment(pixels: ImageData, adjustment: AdjustmentDescriptor) {
  const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
  const cubeLut = adjustment.type === 'color lookup' ? parseColorLookupLut(adjustment) : null
  for (let index = 0; index < pixels.data.length; index += 4) {
    let red = pixels.data[index]
    let green = pixels.data[index + 1]
    let blue = pixels.data[index + 2]
    const luminance = red * 0.299 + green * 0.587 + blue * 0.114
    switch (adjustment.type) {
      case 'levels':
        red = levelValue(levelValue(red, adjustment.rgb), adjustment.red)
        green = levelValue(levelValue(green, adjustment.rgb), adjustment.green)
        blue = levelValue(levelValue(blue, adjustment.rgb), adjustment.blue)
        break
      case 'curves':
        red = curveValue(curveValue(red, adjustment.rgb), adjustment.red)
        green = curveValue(curveValue(green, adjustment.rgb), adjustment.green)
        blue = curveValue(curveValue(blue, adjustment.rgb), adjustment.blue)
        break
      case 'exposure': {
        const multiplier = 2 ** adjustment.exposure
        red = 255 * Math.pow(Math.max(0, red / 255 * multiplier + adjustment.offset), 1 / Math.max(0.01, adjustment.gamma))
        green = 255 * Math.pow(Math.max(0, green / 255 * multiplier + adjustment.offset), 1 / Math.max(0.01, adjustment.gamma))
        blue = 255 * Math.pow(Math.max(0, blue / 255 * multiplier + adjustment.offset), 1 / Math.max(0.01, adjustment.gamma))
        break
      }
      case 'vibrance': {
        const saturation = adjustment.saturation / 100
        const vibrance = adjustment.vibrance / 100 * (1 - (Math.max(red, green, blue) - Math.min(red, green, blue)) / 255)
        red = luminance + (red - luminance) * (1 + saturation + vibrance)
        green = luminance + (green - luminance) * (1 + saturation + vibrance)
        blue = luminance + (blue - luminance) * (1 + saturation + vibrance)
        break
      }
      case 'color balance': {
        const tone = luminance < 85 ? adjustment.shadows : luminance > 170 ? adjustment.highlights : adjustment.midtones
        if (tone) {
          red += tone.cyanRed * 2.55
          green += tone.magentaGreen * 2.55
          blue += tone.yellowBlue * 2.55
        }
        break
      }
      case 'black & white': {
        const yellow = Math.max(0, Math.min(red, green) - blue)
        const cyan = Math.max(0, Math.min(green, blue) - red)
        const magenta = Math.max(0, Math.min(red, blue) - green)
        const redOnly = Math.max(0, red - Math.max(green, blue))
        const greenOnly = Math.max(0, green - Math.max(red, blue))
        const blueOnly = Math.max(0, blue - Math.max(red, green))
        const neutral = Math.min(red, green, blue)
        const weighted = redOnly * adjustment.reds + greenOnly * adjustment.greens + blueOnly * adjustment.blues + yellow * adjustment.yellows + cyan * adjustment.cyans + magenta * adjustment.magentas + neutral * 100
        const gray = weighted / 100
        if (adjustment.useTint) {
          const tint = adjustmentColor(adjustment.tintColor)
          red = gray * tint[0] / 255
          green = gray * tint[1] / 255
          blue = gray * tint[2] / 255
        } else red = green = blue = gray
        break
      }
      case 'photo filter': {
        const filter = adjustmentColor(adjustment.color)
        const amount = Math.max(0, Math.min(1, adjustment.density / 100))
        red += (filter[0] - red) * amount
        green += (filter[1] - green) * amount
        blue += (filter[2] - blue) * amount
        break
      }
      case 'channel mixer': {
        const mix = (channel: typeof adjustment.red | undefined) => channel ? red * channel.red / 100 + green * channel.green / 100 + blue * channel.blue / 100 + channel.constant * 2.55 : 0
        if (adjustment.monochrome && adjustment.gray) red = green = blue = mix(adjustment.gray)
        else [red, green, blue] = [adjustment.red ? mix(adjustment.red) : red, adjustment.green ? mix(adjustment.green) : green, adjustment.blue ? mix(adjustment.blue) : blue]
        break
      }
      case 'invert': red = 255 - red; green = 255 - green; blue = 255 - blue; break
      case 'posterize': {
        const steps = Math.max(2, adjustment.levels) - 1
        red = Math.round(red / 255 * steps) / steps * 255
        green = Math.round(green / 255 * steps) / steps * 255
        blue = Math.round(blue / 255 * steps) / steps * 255
        break
      }
      case 'threshold': red = green = blue = luminance >= adjustment.level ? 255 : 0; break
      case 'gradient map': [red, green, blue] = gradientMapColor(luminance, adjustment); break
      case 'selective color': {
        const maximum = Math.max(red, green, blue)
        const minimum = Math.min(red, green, blue)
        const saturation = maximum - minimum
        let colorRange: typeof adjustment.reds
        if (saturation < 18) colorRange = adjustment.neutrals
        else {
          const hue = maximum === red ? ((green - blue) / saturation + 6) % 6 : maximum === green ? (blue - red) / saturation + 2 : (red - green) / saturation + 4
          const sector = Math.round(hue) % 6
          colorRange = sector === 0 ? adjustment.reds : sector === 1 ? adjustment.yellows : sector === 2 ? adjustment.greens : sector === 3 ? adjustment.cyans : sector === 4 ? adjustment.blues : adjustment.magentas
        }
        const tone = luminance < 48 ? adjustment.blacks ?? colorRange : luminance > 208 ? adjustment.whites ?? colorRange : colorRange ?? adjustment.neutrals
        if (tone) {
          const scale = adjustment.mode === 'relative' ? Math.max(0.1, saturation / 255) : 1
          red += (-tone.c - tone.k) * 2.55 * scale
          green += (-tone.m - tone.k) * 2.55 * scale
          blue += (-tone.y - tone.k) * 2.55 * scale
        }
        break
      }
      case 'color lookup':
        if (cubeLut) [red, green, blue] = sampleCubeLut(cubeLut, red, green, blue)
        break
      case 'camera raw': {
        const exposure = 2 ** adjustment.exposure
        red *= exposure
        green *= exposure
        blue *= exposure
        red += adjustment.temperature * 0.55 + adjustment.tint * 0.12
        green -= adjustment.tint * 0.35
        blue -= adjustment.temperature * 0.55 - adjustment.tint * 0.12
        const tone = luminance / 255
        const shadowWeight = (1 - tone) ** 2
        const highlightWeight = tone ** 2
        const midContrast = (adjustment.contrast + adjustment.clarity * 0.45 + adjustment.texture * 0.2 + adjustment.dehaze * 0.35) / 100
        const tonalOffset = adjustment.shadows * shadowWeight * 1.2 + adjustment.highlights * highlightWeight * 1.2 + adjustment.blacks * (1 - tone) * 0.55 + adjustment.whites * tone * 0.55
        red = (red - 127.5) * (1 + midContrast) + 127.5 + tonalOffset
        green = (green - 127.5) * (1 + midContrast) + 127.5 + tonalOffset
        blue = (blue - 127.5) * (1 + midContrast) + 127.5 + tonalOffset
        const adjustedLuminance = red * 0.299 + green * 0.587 + blue * 0.114
        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue)
        const saturation = adjustment.saturation / 100 + adjustment.vibrance / 100 * (1 - Math.min(1, chroma / 255)) + adjustment.dehaze / 250
        red = adjustedLuminance + (red - adjustedLuminance) * (1 + saturation)
        green = adjustedLuminance + (green - adjustedLuminance) * (1 + saturation)
        blue = adjustedLuminance + (blue - adjustedLuminance) * (1 + saturation)
        break
      }
      case 'brightness/contrast':
      case 'hue/saturation':
        break
    }
    pixels.data[index] = clampByte(red)
    pixels.data[index + 1] = clampByte(green)
    pixels.data[index + 2] = clampByte(blue)
    if (adjustment.type === 'color balance' && adjustment.preserveLuminosity) {
      const adjustedLuminance = pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114
      const correction = luminance - adjustedLuminance
      pixels.data[index] = clampByte(pixels.data[index] + correction)
      pixels.data[index + 1] = clampByte(pixels.data[index + 1] + correction)
      pixels.data[index + 2] = clampByte(pixels.data[index + 2] + correction)
    }
  }
}

function drawAdjustmentLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, adjustment: AdjustmentRenderNode) {
  adjustmentCanvas = prepareScratchCanvas(adjustmentCanvas, canvas)
  const adjustmentContext = adjustmentCanvas.getContext('2d')
  if (!adjustmentContext) return
  adjustmentContext.clearRect(0, 0, canvas.width, canvas.height)
  adjustmentContext.drawImage(canvas, 0, 0)
  const advanced = adjustment.adjustment && adjustment.adjustment.type !== 'brightness/contrast' && adjustment.adjustment.type !== 'hue/saturation'
  if (advanced) {
    mutateCanvasStripes(adjustmentContext, canvas, (pixels) => applyAdvancedAdjustment(pixels, adjustment.adjustment!))
  }
  context.save()
  context.globalAlpha = adjustment.opacity / 100
  context.globalCompositeOperation = adjustment.blendMode === 'normal' ? 'source-over' : adjustment.blendMode
  context.filter = advanced ? `blur(${adjustment.blur}px)` : `brightness(${adjustment.brightness}%) contrast(${adjustment.contrast}%) saturate(${adjustment.saturation}%) hue-rotate(${adjustment.hue}deg) blur(${adjustment.blur}px)`
  context.drawImage(adjustmentCanvas, 0, 0)
  context.restore()
}

function applyDocumentColorOutput(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, documentState: EditorDocument) {
  const mode = documentState.colorMode ?? 'rgb'
  const settings = documentState.colorSettings
  if (mode === 'rgb' && !settings?.proofEnabled && !settings?.gamutWarning) return
  const proof = settings?.proofLut
  const proofLut: CubeLut | null = proof ? { size: proof.size, values: Array.from({ length: proof.size ** 3 }, (_, index) => [proof.data[index * 3] / 255, proof.data[index * 3 + 1] / 255, proof.data[index * 3 + 2] / 255]), domainMin: [0, 0, 0], domainMax: [1, 1, 1], order: 'red-fastest' } : null
  const indexedSteps = Math.max(2, Math.round(Math.cbrt(documentState.indexedColors ?? 256)))
  mutateCanvasStripes(context, canvas, (pixels) => {
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      if (pixels.data[offset + 3] === 0) continue
      let red = pixels.data[offset]
      let green = pixels.data[offset + 1]
      let blue = pixels.data[offset + 2]
      if (mode === 'grayscale') red = green = blue = Math.round(red * 0.299 + green * 0.587 + blue * 0.114)
      else if (mode === 'indexed') {
        red = Math.round(red / 255 * (indexedSteps - 1)) / (indexedSteps - 1) * 255
        green = Math.round(green / 255 * (indexedSteps - 1)) / (indexedSteps - 1) * 255
        blue = Math.round(blue / 255 * (indexedSteps - 1)) / (indexedSteps - 1) * 255
      } else if (mode === 'cmyk') {
        const black = 1 - Math.max(red, green, blue) / 255
        const cyan = (1 - red / 255 - black) / Math.max(0.0001, 1 - black)
        const magenta = (1 - green / 255 - black) / Math.max(0.0001, 1 - black)
        const yellow = (1 - blue / 255 - black) / Math.max(0.0001, 1 - black)
        const inkScale = Math.min(1, 3 / Math.max(0.0001, cyan + magenta + yellow + black))
        red = 255 * (1 - Math.min(1, cyan * inkScale) * (1 - black * inkScale) - black * inkScale)
        green = 255 * (1 - Math.min(1, magenta * inkScale) * (1 - black * inkScale) - black * inkScale)
        blue = 255 * (1 - Math.min(1, yellow * inkScale) * (1 - black * inkScale) - black * inkScale)
      }
      if (proofLut && (settings?.proofEnabled || settings?.gamutWarning)) {
        const original: [number, number, number] = [red, green, blue]
        if (settings.proofEnabled) [red, green, blue] = sampleCubeLut(proofLut, red, green, blue)
        if (settings.gamutWarning && proof) {
          const r = Math.round(original[0] / 255 * (proof.size - 1)); const g = Math.round(original[1] / 255 * (proof.size - 1)); const b = Math.round(original[2] / 255 * (proof.size - 1))
          if (proof.gamut[r + g * proof.size + b * proof.size * proof.size]) [red, green, blue] = [255, 0, 255]
        }
      }
      pixels.data[offset] = Math.max(0, Math.min(255, Math.round(red)))
      pixels.data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)))
      pixels.data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)))
    }
  })
}

const groupCompositionCanvases: HTMLCanvasElement[] = []

function drawRenderPlan(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  documentState: EditorDocument,
  assets: AssetMap,
  resources: RenderResourceRegistry,
  nodes: RenderPlanNode[],
  depth = 0,
) {
  const layers = new Map(documentState.layers.map((layer) => [layer.id, layer]))
  for (const node of nodes) {
    if (node.kind === 'group') {
      if (!node.isolated) {
        drawRenderPlan(context, canvas, documentState, assets, resources, node.children, depth)
        continue
      }
      const groupCanvas = prepareScratchCanvas(groupCompositionCanvases[depth] ?? null, canvas)
      groupCompositionCanvases[depth] = groupCanvas
      const groupContext = groupCanvas.getContext('2d')
      if (!groupContext) continue
      groupContext.clearRect(0, 0, canvas.width, canvas.height)
      drawRenderPlan(groupContext, groupCanvas, documentState, assets, resources, node.children, depth + 1)
      context.save()
      context.globalAlpha = node.opacity / 100
      context.globalCompositeOperation = node.blendMode === 'normal' ? 'source-over' : node.blendMode
      context.drawImage(groupCanvas, 0, 0)
      context.restore()
      continue
    }

    const layer = layers.get(node.layerId)
    if (!layer) continue
    if (node.kind === 'adjustment' && layer.type === 'adjustment') {
      drawAdjustmentLayer(context, canvas, node)
      continue
    }
    if (node.kind !== 'layer' || layer.type === 'adjustment') continue
    context.save()
    context.globalCompositeOperation = node.blendMode === 'normal' ? 'source-over' : node.blendMode
    if (node.filters) context.filter = layerFilterCss(node.filters)
    const clippingBase = node.clipBaseLayerId ? layers.get(node.clipBaseLayerId) : null
    if (clippingBase) drawLayerWithEffects(context, canvas, node.effects, node.additionalEffects ?? [], (target) => drawClippedLayer(target, canvas, layer, node.maskAssetId, clippingBase, assets, resources))
    else drawLayerWithEffects(context, canvas, node.effects, node.additionalEffects ?? [], (target) => drawMaskedLayer(target, canvas, layer, node.maskAssetId, assets, resources))
    context.restore()
  }
}

export function getLayerBounds(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  layer: EditorLayer,
  assets: AssetMap,
): LayerBounds | null {
  if (layer.type === 'image') {
    const asset = assets[layer.assetId]
    return asset ? calculateImageRect(canvas.width, canvas.height, asset.element.naturalWidth, asset.element.naturalHeight, layer) : null
  }
  if (layer.type === 'raster') {
    const asset = assets[layer.assetId]
    if (asset?.contentBounds === null) return null
    const bounds = rasterBounds(canvas, layer)
    const content = asset?.contentBounds
    const sourceWidth = asset?.surface?.width ?? 0
    const sourceHeight = asset?.surface?.height ?? 0
    if (!content || sourceWidth === 0 || sourceHeight === 0) return bounds
    const localWidth = content.width / sourceWidth * bounds.width
    const localHeight = content.height / sourceHeight * bounds.height
    const localCenterX = ((content.x + content.width / 2) / sourceWidth - 0.5) * bounds.width * (layer.flipX ? -1 : 1)
    const localCenterY = ((content.y + content.height / 2) / sourceHeight - 0.5) * bounds.height * (layer.flipY ? -1 : 1)
    const angle = bounds.rotation * Math.PI / 180
    const centerX = bounds.x + bounds.width / 2 + localCenterX * Math.cos(angle) - localCenterY * Math.sin(angle)
    const centerY = bounds.y + bounds.height / 2 + localCenterX * Math.sin(angle) + localCenterY * Math.cos(angle)
    return { x: centerX - localWidth / 2, y: centerY - localHeight / 2, width: localWidth, height: localHeight, rotation: bounds.rotation }
  }
  if (layer.type === 'smart-object') {
    const quad = smartObjectDisplayQuad(layer, canvas.width, canvas.height)
    return quad ? { ...quadBounds(quad), rotation: 0 } : rasterBounds(canvas, layer)
  }
  if (layer.type === 'shape') return shapeBounds(canvas, layer)
  if (layer.type === 'adjustment') return null
  if (layer.textPath?.path) {
    const points = flattenTextPath(layer.textPath.path, canvas.width, canvas.height)
    if (points.length) {
      const minimumX = Math.min(...points.map((point) => point.x))
      const maximumX = Math.max(...points.map((point) => point.x))
      const minimumY = Math.min(...points.map((point) => point.y))
      const maximumY = Math.max(...points.map((point) => point.y))
      return { x: minimumX, y: minimumY - layer.fontSize, width: Math.max(1, maximumX - minimumX), height: Math.max(layer.fontSize, maximumY - minimumY + layer.fontSize), rotation: 0 }
    }
  }
  const metrics = textMetrics(context, layer)
  return {
    x: canvas.width / 2 - metrics.width / 2 + layer.position.x * canvas.width,
    y: canvas.height / 2 - metrics.height / 2 + layer.position.y * canvas.height,
    width: metrics.width,
    height: metrics.height,
    rotation: layer.rotation,
  }
}

function pointInsideRotatedBounds(point: Position, bounds: LayerBounds) {
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const angle = (-bounds.rotation * Math.PI) / 180
  const dx = point.x - centerX
  const dy = point.y - centerY
  const x = centerX + dx * Math.cos(angle) - dy * Math.sin(angle)
  const y = centerY + dx * Math.sin(angle) + dy * Math.cos(angle)
  return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height
}

export function getResizeHandles(bounds: LayerBounds): Record<ResizeHandle, Position> {
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const angle = (bounds.rotation * Math.PI) / 180
  const rotate = (x: number, y: number) => {
    const dx = x - centerX
    const dy = y - centerY
    return {
      x: centerX + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: centerY + dx * Math.sin(angle) + dy * Math.cos(angle),
    }
  }
  return {
    nw: rotate(bounds.x, bounds.y),
    n: rotate(bounds.x + bounds.width / 2, bounds.y),
    ne: rotate(bounds.x + bounds.width, bounds.y),
    e: rotate(bounds.x + bounds.width, bounds.y + bounds.height / 2),
    se: rotate(bounds.x + bounds.width, bounds.y + bounds.height),
    s: rotate(bounds.x + bounds.width / 2, bounds.y + bounds.height),
    sw: rotate(bounds.x, bounds.y + bounds.height),
    w: rotate(bounds.x, bounds.y + bounds.height / 2),
  }
}

export function findResizeHandle(point: Position, bounds: LayerBounds, tolerance: number): ResizeHandle | null {
  const handles = getResizeHandles(bounds)
  for (const [name, position] of Object.entries(handles) as [ResizeHandle, Position][]) {
    if (Math.hypot(point.x - position.x, point.y - position.y) <= tolerance) return name
  }
  return null
}

export function findLayerAtPoint(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  document: EditorDocument,
  assets: AssetMap,
  point: Position,
) {
  return flattenStackLayers(document).findLast((layer) => {
    if (!layerIsVisible(document, layer) || layerIsLocked(document, layer)) return false
    const bounds = getLayerBounds(context, canvas, layer, assets)
    return bounds ? pointInsideRotatedBounds(point, bounds) : false
  }) ?? null
}

function drawSelection(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: EditorLayer, assets: AssetMap) {
  const bounds = getLayerBounds(context, canvas, layer, assets)
  if (!bounds) return
  withLayerTransform(context, bounds, false, false, () => {
    const x = -bounds.width / 2
    const y = -bounds.height / 2
    context.save()
    context.strokeStyle = '#a78bfa'
    context.lineWidth = Math.max(2, canvas.width / 700)
    context.setLineDash([10, 7])
    context.strokeRect(x - 4, y - 4, bounds.width + 8, bounds.height + 8)
    context.setLineDash([])
    context.fillStyle = '#f5f3ff'
    for (const [handleX, handleY] of [[x, y], [x + bounds.width, y], [x + bounds.width, y + bounds.height], [x, y + bounds.height]]) {
      context.beginPath()
      context.arc(handleX, handleY, Math.max(5, canvas.width / 280), 0, Math.PI * 2)
      context.fill()
      context.strokeStyle = '#7c3aed'
      context.stroke()
    }
    context.restore()
  })
}

export function renderComposition(
  canvas: HTMLCanvasElement,
  document: EditorDocument,
  assets: AssetMap,
  options: RenderCompositionOptions = {},
  resources = new RenderResourceRegistry(),
) {
  const preset = getDocumentSize(document)
  const viewport = options.viewport
  const outputWidth = viewport ? Math.max(1, Math.ceil(viewport.width)) : preset.width
  const outputHeight = viewport ? Math.max(1, Math.ceil(viewport.height)) : preset.height
  if (canvas.width !== outputWidth) canvas.width = outputWidth
  if (canvas.height !== outputHeight) canvas.height = outputHeight
  const context = canvas.getContext('2d')
  if (!context) return
  const layoutCanvas = viewport ? {
    width: preset.width,
    height: preset.height,
    getContext: () => context,
  } as unknown as HTMLCanvasElement : canvas

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.save()
  if (viewport) context.translate(-viewport.x, -viewport.y)
  resources.prune('canvas2d', new Set(Object.keys(assets)))
  drawBackground(context, preset.width, preset.height, document, assets, resources)
  drawPattern(context, preset.width, preset.height, document)

  drawRenderPlan(context, layoutCanvas, document, assets, resources, buildCompositionRenderPlan(document).nodes)

  if (document.artboards?.length) {
    context.save()
    context.globalCompositeOperation = 'destination-in'
    context.fillStyle = '#000000'
    context.beginPath()
    for (const artboard of document.artboards) context.rect(artboard.x, artboard.y, artboard.width, artboard.height)
    context.fill()
    context.restore()
  }

  if (options.showSelection && document.selectedLayerId) {
    const selected = document.layers.find((layer) => layer.id === document.selectedLayerId)
    if (selected?.visible) drawSelection(context, layoutCanvas, selected, assets)
  }
  context.restore()
  applyDocumentColorOutput(context, canvas, document)
}

export function renderNativeLayerPasses(
  passCanvases: HTMLCanvasElement[],
  documentState: EditorDocument,
  assets: AssetMap,
  resources: RenderResourceRegistry,
  options: RenderCompositionOptions = {},
  passCache?: RenderPassCache,
): NativeLayerPasses | null {
  const plan = buildNativeLayerCompositionPlan(documentState)
  if (!plan) return null

  const size = getDocumentSize(documentState)
  const passCount = 1 + plan.layers.length + (options.showSelection && documentState.selectedLayerId ? 1 : 0)
  while (passCanvases.length < passCount) passCanvases.push(globalThis.document.createElement('canvas'))
  resources.prune('canvas2d', new Set(Object.keys(assets)))

  const preparePass = (
    index: number,
    signature: string | null = null,
    partial?: {
      structureSignature: string | null
      revision: number
      dirtyRegions: ReadonlyArray<{ revision: number; region: RasterRegion }>
    },
  ) => {
    while (passCanvases.length <= index) passCanvases.push(globalThis.document.createElement('canvas'))
    const canvas = passCanvases[index]
    const sizeChanged = canvas.width !== size.width || canvas.height !== size.height
    if (canvas.width !== size.width) canvas.width = size.width
    if (canvas.height !== size.height) canvas.height = size.height
    const context = canvas.getContext('2d')
    const invalidation = passCache?.prepare(index, signature, size.width, size.height, {
      invalidated: sizeChanged,
      structureSignature: partial?.structureSignature,
      revision: partial?.revision,
      dirtyRegions: partial?.dirtyRegions,
    }) ?? { shouldRender: true, regions: [{ x: 0, y: 0, width: size.width, height: size.height }] }
    if (invalidation.shouldRender && !sizeChanged) {
      for (const region of invalidation.regions) context?.clearRect(region.x, region.y, region.width, region.height)
    }
    return { canvas, context, shouldRender: invalidation.shouldRender, regions: invalidation.regions }
  }

  const drawRegions = (context: CanvasRenderingContext2D, regions: readonly RasterRegion[], draw: () => void) => {
    context.save()
    context.beginPath()
    for (const region of regions) context.rect(region.x, region.y, region.width, region.height)
    context.clip()
    draw()
    context.restore()
  }

  const background = preparePass(0, backgroundPassSignature(documentState, assets))
  if (!background.context) return null
  if (background.shouldRender) {
    drawBackground(background.context, size.width, size.height, documentState, assets, resources)
    drawPattern(background.context, size.width, size.height, documentState)
  }

  const layers = new Map(documentState.layers.map((layer) => [layer.id, layer]))
  plan.layers.forEach((node, index) => {
    const layer = node.kind === 'group' ? undefined : layers.get(node.layerId)
    const signature = node.kind === 'layer'
      ? layer && !node.filters?.blur && !node.effects?.dropShadow.enabled && !node.effects?.outerGlow.enabled ? layerPassSignature(layer, assets) : null
      : node.kind === 'adjustment'
        ? `adjustment:${node.layerId}`
        : groupPassSignature(documentState, node.groupId, assets)
    const rasterAsset = node.kind === 'layer' && layer?.type === 'raster' ? assets[layer.assetId] : undefined
    const partial = node.kind === 'layer' && layer?.type === 'raster' && signature && rasterAsset?.surface
      ? {
          structureSignature: layerPassStructureSignature(layer, assets),
          revision: rasterAsset.revision ?? 0,
          dirtyRegions: (rasterAsset.dirtyRegions ?? []).map((entry) => ({
            revision: entry.revision,
            region: rasterRegionToDocument(passCanvases[index + 1], layer, rasterAsset.surface!.width, rasterAsset.surface!.height, entry.region),
          })),
        }
      : undefined
    const pass = preparePass(index + 1, signature, partial)
    if (pass.shouldRender && node.kind === 'layer' && pass.context && layer && layer.type !== 'adjustment') {
      drawRegions(pass.context, pass.regions, () => {
        if (node.filters?.blur || node.effects?.dropShadow.enabled || node.effects?.outerGlow.enabled) {
          const clippingBase = node.clipBaseLayerId ? layers.get(node.clipBaseLayerId) : null
          if (clippingBase && clippingBase.type !== 'adjustment') drawClippedLayer(pass.context!, pass.canvas, layer, node.maskAssetId, clippingBase, assets, resources)
          else drawMaskedLayer(pass.context!, pass.canvas, layer, node.maskAssetId, assets, resources)
        } else drawEditorLayer(pass.context!, pass.canvas, layer, assets, resources)
      })
    } else if (pass.shouldRender && node.kind === 'group' && pass.context) {
      drawRegions(pass.context, pass.regions, () => drawRenderPlan(pass.context!, pass.canvas, documentState, assets, resources, node.children))
    }
  })

  if (passCount > plan.layers.length + 1 && documentState.selectedLayerId) {
    const selection = preparePass(passCount - 1)
    const selected = layers.get(documentState.selectedLayerId)
    if (selection.context && selected?.visible) drawSelection(selection.context, selection.canvas, selected, assets)
  }

  const compositionLayers: NativeLayerPass[] = [{ kind: 'layer', source: passCanvases[0], blendMode: 'normal' }]
  let clipPassIndex = passCount
  plan.layers.forEach((node, index) => {
    if (node.kind === 'group') {
      compositionLayers.push({
        kind: 'layer',
        source: passCanvases[index + 1],
        blendMode: node.blendMode as TypeGpuBlendMode,
        opacity: node.opacity / 100,
      })
      return
    }
    if (node.kind === 'adjustment') {
      compositionLayers.push({
        kind: 'adjustment',
        blendMode: node.blendMode as TypeGpuBlendMode,
        opacity: node.opacity / 100,
        brightness: node.brightness / 100,
        contrast: node.contrast / 100,
        saturation: node.saturation / 100,
        hue: node.hue * Math.PI / 180,
        blur: node.blur,
      })
      return
    }
    const bakedSource = Boolean(node.filters?.blur || node.effects?.dropShadow.enabled || node.effects?.outerGlow.enabled)
    const maskSource = node.maskAssetId && !bakedSource
      ? canvasImageResource(resources, assets, node.maskAssetId)?.source
      : undefined
    const filterMaskSource = node.filterMaskAssetId ? canvasImageResource(resources, assets, node.filterMaskAssetId)?.source : undefined
    let clipSource: HTMLCanvasElement | undefined
    const clippingBase = node.clipBaseLayerId && !bakedSource ? layers.get(node.clipBaseLayerId) : null
    if (clippingBase && clippingBase.type !== 'adjustment') {
      const clipPass = preparePass(clipPassIndex, maskedLayerPassSignature(clippingBase, assets))
      clipPassIndex += 1
      if (clipPass.shouldRender && clipPass.context) {
        drawMaskedLayer(
          clipPass.context,
          clipPass.canvas,
          clippingBase,
          clippingBase.maskAssetId ?? null,
          assets,
          resources,
        )
        clipSource = clipPass.canvas
      }
    }
    compositionLayers.push({
      kind: 'layer',
      source: passCanvases[index + 1],
      maskSource,
      clipSource,
      blendMode: node.blendMode as TypeGpuBlendMode,
      filters: node.filters,
      effects: node.effects,
      filterGraph: node.filterGraphEnabled ? node.filterGraph : [],
      filterMaskSource,
    })
  })
  if (passCount > plan.layers.length + 1) {
    compositionLayers.push({ kind: 'layer', source: passCanvases[passCount - 1], blendMode: 'normal' })
  }
  passCache?.truncate(clipPassIndex)
  return { width: size.width, height: size.height, layers: compositionLayers }
}
