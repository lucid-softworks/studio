import { initializeCanvas, readPsd, writePsd, type Color, type Layer, type LayerMaskData, type Psd } from 'ag-psd'
import { defaultLayerEffects } from './effects'
import { loadImageBlob, surfaceToBlob } from './image'
import { createAdjustmentLayer, createId, createRasterLayer, getDocumentSize, initialDocument } from './presets'
import { renderComposition, getLayerBounds } from './renderer'
import { RenderResourceRegistry } from './rendering/render-resource-registry'
import type { AssetMap } from './runtime-assets'
import type { AdjustmentLayer, BlendMode, EditorDocument, EditorLayer, LayerEffects, LayerGroup, ShapeLayer, TextLayer } from './types'

let initialized = false

function initializeBrowserCanvas() {
  if (initialized) return
  initializeCanvas((width, height) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }, (width, height) => new ImageData(width, height))
  initialized = true
}

export function psdLayerNamesInEditorOrder(layers: Layer[], parent = '', sourceIsTopToBottom = true): string[] {
  const editorOrder = sourceIsTopToBottom ? [...layers].reverse() : layers
  return editorOrder.flatMap((layer, editorIndex) => {
    const name = layer.name?.trim() || `Layer ${sourceIsTopToBottom ? layers.length - editorIndex : editorIndex + 1}`
    const path = parent ? `${parent} / ${name}` : name
    return layer.children ? psdLayerNamesInEditorOrder(layer.children, path, sourceIsTopToBottom) : [path]
  })
}

async function sourceFromCanvas(canvas: HTMLCanvasElement, name: string) {
  const blob = await surfaceToBlob(canvas)
  const source = await loadImageBlob(blob, name)
  return { ...source, surface: canvas, revision: 0 }
}

async function sourceFromMask(mask: LayerMaskData, width: number, height: number, name: string) {
  const source = layerCanvas(mask)
  if (!source) return null
  const sourceContext = source.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) return null
  const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null
  const defaultAlpha = mask.defaultColor ?? 255
  const pixels = new ImageData(width, height)
  for (let index = 0; index < pixels.data.length; index += 4) {
    pixels.data[index] = 255
    pixels.data[index + 1] = 255
    pixels.data[index + 2] = 255
    pixels.data[index + 3] = defaultAlpha
  }
  const left = mask.left ?? 0
  const top = mask.top ?? 0
  for (let y = 0; y < source.height; y += 1) {
    const targetY = top + y
    if (targetY < 0 || targetY >= height) continue
    for (let x = 0; x < source.width; x += 1) {
      const targetX = left + x
      if (targetX < 0 || targetX >= width) continue
      const sourceIndex = (y * source.width + x) * 4
      const targetIndex = (targetY * width + targetX) * 4
      const alpha = sourcePixels.data[sourceIndex]
      pixels.data[targetIndex] = 255
      pixels.data[targetIndex + 1] = 255
      pixels.data[targetIndex + 2] = 255
      pixels.data[targetIndex + 3] = alpha
    }
  }
  context.putImageData(pixels, 0, 0)
  return sourceFromCanvas(canvas, name)
}

function layerCanvas(layer: Pick<Layer | Psd | LayerMaskData, 'imageData' | 'canvas'>) {
  if (layer.imageData) {
    const canvas = document.createElement('canvas')
    canvas.width = layer.imageData.width
    canvas.height = layer.imageData.height
    const context = canvas.getContext('2d')
    if (!context) return null
    const pixels = new ImageData(new Uint8ClampedArray(layer.imageData.data), layer.imageData.width, layer.imageData.height)
    context.putImageData(pixels, 0, 0)
    return canvas
  }
  return layer.canvas ?? null
}

const psdBlendModes: Partial<Record<NonNullable<Layer['blendMode']>, BlendMode>> = {
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color dodge': 'color-dodge',
  'color burn': 'color-burn',
  'hard light': 'hard-light',
  'soft light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
}

export function psdBlendMode(value: Layer['blendMode']): BlendMode {
  return value ? psdBlendModes[value] ?? 'normal' : 'normal'
}

function colorHex(color: Color | undefined) {
  if (!color) return '#ffffff'
  const channels = 'r' in color
    ? [color.r, color.g, color.b]
    : 'fr' in color
      ? [color.fr * 255, color.fg * 255, color.fb * 255]
      : null
  return channels
    ? `#${channels.map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('')}`
    : '#ffffff'
}

function hasCustomBlending(layer: Layer) {
  if (layer.knockout) return true
  const ranges = layer.blendingRanges
  if (!ranges) return false
  const isDefault = (range: number[]) => range.length === 4 && range[0] === 0 && range[1] === 0 && range[2] === 255 && range[3] === 255
  return !isDefault(ranges.compositeGrayBlendSource)
    || !isDefault(ranges.compositeGraphBlendDestinationRange)
    || ranges.ranges.some((range) => !isDefault(range.sourceRange) || !isDefault(range.destRange))
}

function importableRasterMask(layer: Layer) {
  const mask = layer.realMask ?? layer.mask
  return Boolean(mask && !mask.disabled && (mask.imageData || mask.canvas))
}

function effectEnabled(effect: { enabled?: boolean; present?: boolean } | undefined) {
  return Boolean(effect && effect.enabled !== false && effect.present !== false)
}

export function psdLayerEffects(layer: Layer): LayerEffects | null {
  const effects = layer.effects
  if (!effects || effects.disabled) return null
  const dropShadow = effects.dropShadow?.find(effectEnabled)
  const outerGlow = effectEnabled(effects.outerGlow) ? effects.outerGlow : undefined
  const colorOverlay = effects.solidFill?.find(effectEnabled)
  if (!dropShadow && !outerGlow && !colorOverlay) return null
  return {
    ...defaultLayerEffects,
    dropShadow: {
      enabled: Boolean(dropShadow),
      color: colorHex(dropShadow?.color),
      opacity: Math.round((dropShadow?.opacity ?? 1) * 100),
      angle: dropShadow?.angle ?? defaultLayerEffects.dropShadow.angle,
      distance: dropShadow?.distance?.value ?? defaultLayerEffects.dropShadow.distance,
      blur: dropShadow?.size?.value ?? defaultLayerEffects.dropShadow.blur,
    },
    outerGlow: {
      enabled: Boolean(outerGlow),
      color: colorHex(outerGlow?.color),
      opacity: Math.round((outerGlow?.opacity ?? 1) * 100),
      size: outerGlow?.size?.value ?? defaultLayerEffects.outerGlow.size,
    },
    colorOverlay: {
      enabled: Boolean(colorOverlay),
      color: colorHex(colorOverlay?.color),
      opacity: Math.round((colorOverlay?.opacity ?? 1) * 100),
    },
  }
}

function psdShapeGeometry(layer: Layer) {
  if (!layer.vectorFill || layer.vectorFill.type !== 'color') return null
  const origin = layer.vectorOrigination?.keyDescriptorList.find((item) => item.keyOriginShapeBoundingBox)
  const path = layer.vectorMask?.paths.length === 1 ? layer.vectorMask.paths[0] : undefined
  if (!origin && (!path || path.open || path.knots.length !== 4 || path.operation === 'subtract' || path.operation === 'intersect')) return null
  const anchors = path?.knots.map((knot) => ({ x: knot.points[2], y: knot.points[3] })) ?? []
  const box = origin?.keyOriginShapeBoundingBox
  const left = box?.left.value ?? Math.min(...anchors.map((point) => point.x))
  const top = box?.top.value ?? Math.min(...anchors.map((point) => point.y))
  const right = box?.right.value ?? Math.max(...anchors.map((point) => point.x))
  const bottom = box?.bottom.value ?? Math.max(...anchors.map((point) => point.y))
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) return null
  const rounded = origin?.keyOriginRRectRadii
  const curved = path?.knots.some((knot) => (
    Math.abs(knot.points[0] - knot.points[2]) > 0.01
    || Math.abs(knot.points[1] - knot.points[3]) > 0.01
    || Math.abs(knot.points[4] - knot.points[2]) > 0.01
    || Math.abs(knot.points[5] - knot.points[3]) > 0.01
  ))
  const cornerRadius = rounded
    ? Math.max(rounded.topLeft.value, rounded.topRight.value, rounded.bottomLeft.value, rounded.bottomRight.value)
    : 0
  return { left, top, right, bottom, shape: curved && !rounded ? 'ellipse' as const : 'rectangle' as const, cornerRadius, transform: origin?.transform }
}

export function canImportPsdShape(layer: Layer) {
  return Boolean(psdShapeGeometry(layer))
}

export function psdShapeLayer(layer: Layer, documentWidth: number, documentHeight: number): ShapeLayer | null {
  const geometry = psdShapeGeometry(layer)
  if (!geometry || !layer.vectorFill || layer.vectorFill.type !== 'color') return null
  const stroke = layer.vectorStroke
  const strokeColor = stroke?.content?.type === 'color' ? stroke.content.color : undefined
  const transform = geometry.transform ?? [1, 0, 0, 1, 0, 0]
  return {
    id: createId(),
    type: 'shape',
    name: layer.name?.trim() || (geometry.shape === 'ellipse' ? 'Ellipse' : 'Rectangle'),
    shape: geometry.shape,
    visible: !layer.hidden,
    locked: Boolean(layer.protected?.position || layer.protected?.composite),
    opacity: Math.round((layer.opacity ?? 1) * 100),
    position: {
      x: ((geometry.left + geometry.right) / 2 - documentWidth / 2) / documentWidth,
      y: ((geometry.top + geometry.bottom) / 2 - documentHeight / 2) / documentHeight,
    },
    rotation: Math.atan2(transform[1] ?? 0, transform[0] ?? 1) * 180 / Math.PI,
    blendMode: psdBlendMode(layer.blendMode),
    clipToBelow: Boolean(layer.clipping),
    width: (geometry.right - geometry.left) / documentWidth * 100,
    height: (geometry.bottom - geometry.top) / documentHeight * 100,
    fill: colorHex(layer.vectorFill.color),
    stroke: colorHex(strokeColor),
    strokeWidth: stroke?.strokeEnabled ? stroke.lineWidth?.value ?? 1 : 0,
    cornerRadius: geometry.cornerRadius,
    effects: psdLayerEffects(layer),
  }
}

function hasUnsupportedEffects(layer: Layer) {
  const effects = layer.effects
  if (!effects || effects.disabled) return false
  return Boolean(
    effects.innerShadow?.some(effectEnabled)
    || effectEnabled(effects.innerGlow)
    || effectEnabled(effects.bevel)
    || effectEnabled(effects.satin)
    || effects.stroke?.some(effectEnabled)
    || effects.gradientOverlay?.some(effectEnabled)
    || effectEnabled(effects.patternOverlay)
    || (effects.dropShadow?.filter(effectEnabled).length ?? 0) > 1
    || (effects.solidFill?.filter(effectEnabled).length ?? 0) > 1
  )
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

function hasChannelSpecificHueAdjustment(adjustment: Extract<NonNullable<Layer['adjustment']>, { type: 'hue/saturation' }>) {
  return [adjustment.reds, adjustment.yellows, adjustment.greens, adjustment.cyans, adjustment.blues, adjustment.magentas]
    .some((channel) => channel && (channel.hue !== 0 || channel.saturation !== 0 || channel.lightness !== 0))
}

export function canImportPsdAdjustment(layer: Layer) {
  const source = layer.adjustment
  return Boolean(
    source
    && ((source.type === 'brightness/contrast' && !source.labColorOnly)
      || (source.type === 'hue/saturation' && !hasChannelSpecificHueAdjustment(source)))
  )
}

export function psdAdjustmentLayer(layer: Layer, index: number): AdjustmentLayer | null {
  const source = layer.adjustment
  if (!source || !canImportPsdAdjustment(layer)) return null
  const adjustment = createAdjustmentLayer(index)
  if (source.type === 'brightness/contrast' && !source.labColorOnly) {
    adjustment.brightness = clamp(100 + (source.brightness ?? 0), 0, 200)
    adjustment.contrast = clamp(100 + (source.contrast ?? 0), 0, 200)
  } else if (source.type === 'hue/saturation' && !hasChannelSpecificHueAdjustment(source)) {
    adjustment.hue = clamp(source.master?.hue ?? 0, -180, 180)
    adjustment.saturation = clamp(100 + (source.master?.saturation ?? 0), 0, 200)
    adjustment.brightness = clamp(100 + (source.master?.lightness ?? 0), 0, 200)
  } else return null

  adjustment.name = layer.name?.trim() || (source.type === 'hue/saturation' ? 'Hue / Saturation' : 'Brightness / Contrast')
  adjustment.visible = !layer.hidden
  adjustment.locked = Boolean(layer.protected?.position || layer.protected?.composite)
  adjustment.opacity = Math.round((layer.opacity ?? 1) * 100)
  adjustment.blendMode = psdBlendMode(layer.blendMode)
  adjustment.clipToBelow = Boolean(layer.clipping)
  return adjustment
}

export function canImportPsdText(layer: Layer) {
  const text = layer.text
  return Boolean(text && (text.styleRuns?.some((run) => run.style) || text.style))
}

export function psdTextLayer(layer: Layer, documentWidth: number, documentHeight: number): TextLayer | null {
  if (!canImportPsdText(layer)) return null
  const text = layer.text!
  const style = text.styleRuns?.[0]?.style ?? text.style
  if (!style) return null
  const paragraph = text.paragraphStyleRuns?.[0]?.style ?? text.paragraphStyle
  const transform = text.transform ?? [1, 0, 0, 1, 0, 0]
  const scale = Math.hypot(transform[0] ?? 1, transform[1] ?? 0) || 1
  const fontSize = Math.max(1, (style.fontSize ?? 24) * scale)
  const left = layer.left ?? text.left ?? 0
  const top = layer.top ?? text.top ?? 0
  const right = layer.right ?? text.right ?? left + fontSize
  const bottom = layer.bottom ?? text.bottom ?? top + fontSize
  const fontName = style.font?.name ?? 'Inter'
  const justification = paragraph?.justification
  const textAlign = justification?.startsWith('right') ? 'right' : justification?.startsWith('center') ? 'center' : 'left'
  const semibold = /semibold|demibold|medium/i.test(fontName)
  const bold = Boolean(style.fauxBold || (!semibold && /bold|black|heavy/i.test(fontName)))
  const fontWeight = bold ? 700 as const : semibold ? 600 as const : 400 as const
  let styleStart = 0
  const styleRuns = (text.styleRuns ?? [{ length: text.text.length, style }]).map((run) => {
    const runStyle = run.style ?? style
    const runFontName = runStyle.font?.name ?? fontName
    const runSemibold = /semibold|demibold|medium/i.test(runFontName)
    const runBold = Boolean(runStyle.fauxBold || (!runSemibold && /bold|black|heavy/i.test(runFontName)))
    const start = styleStart
    styleStart += run.length
    const runFontSize = Math.max(1, (runStyle.fontSize ?? style.fontSize ?? 24) * scale)
    return {
      start,
      length: run.length,
      fontFamily: runFontName,
      fontSize: runFontSize,
      fontWeight: runBold ? 700 as const : runSemibold ? 600 as const : 400 as const,
      color: colorHex(runStyle.fillColor ?? style.fillColor),
      letterSpacing: (runStyle.tracking ?? 0) * runFontSize / 1000,
      leading: runStyle.leading,
      baselineShift: runStyle.baselineShift,
      horizontalScale: runStyle.horizontalScale,
      verticalScale: runStyle.verticalScale,
      fauxItalic: runStyle.fauxItalic,
      underline: runStyle.underline,
      strikethrough: runStyle.strikethrough,
    }
  })
  let paragraphStart = 0
  const paragraphRuns = (text.paragraphStyleRuns ?? (paragraph ? [{ length: text.text.length, style: paragraph }] : [])).map((run) => {
    const justification = run.style.justification
    const start = paragraphStart
    paragraphStart += run.length
    return {
      start,
      length: run.length,
      textAlign: justification?.startsWith('right') ? 'right' as const : justification?.startsWith('center') ? 'center' as const : justification?.startsWith('justify') ? 'justify' as const : 'left' as const,
      firstLineIndent: run.style.firstLineIndent,
      startIndent: run.style.startIndent,
      endIndent: run.style.endIndent,
      spaceBefore: run.style.spaceBefore,
      spaceAfter: run.style.spaceAfter,
      leading: run.style.autoLeading,
    }
  })
  const box = text.boxBounds
  const unitsBounds = text.bounds
  const paragraphBox = text.shapeType === 'box'
    ? box && box.length >= 4
      ? { width: Math.abs(box[2] - box[0]), height: Math.abs(box[3] - box[1]) }
      : unitsBounds
        ? { width: Math.abs(unitsBounds.right.value - unitsBounds.left.value), height: Math.abs(unitsBounds.bottom.value - unitsBounds.top.value) }
        : { width: right - left, height: bottom - top }
    : undefined
  const fontNames = [...new Set(styleRuns.map((run) => run.fontFamily))]
  const missingFonts = typeof document !== 'undefined' && document.fonts
    ? fontNames.filter((family) => !document.fonts.check(`12px "${family.replace(/["\\]/g, '')}"`))
    : fontNames

  return {
    id: createId(),
    type: 'text',
    name: layer.name?.trim() || 'Text',
    text: text.text.replace(/\r\n?/g, '\n').split('\u0000').join(''),
    visible: !layer.hidden,
    locked: Boolean(layer.protected?.position || layer.protected?.composite),
    opacity: Math.round((layer.opacity ?? 1) * 100),
    position: {
      x: ((left + right) / 2 - documentWidth / 2) / documentWidth,
      y: ((top + bottom) / 2 - documentHeight / 2) / documentHeight,
    },
    rotation: Math.atan2(transform[1] ?? 0, transform[0] ?? 1) * 180 / Math.PI,
    blendMode: psdBlendMode(layer.blendMode),
    clipToBelow: Boolean(layer.clipping),
    color: colorHex(style.fillColor),
    fontFamily: fontName,
    fontSize,
    fontWeight,
    textAlign,
    letterSpacing: (style.tracking ?? 0) * fontSize / 1000,
    styleRuns,
    paragraphRuns,
    paragraphBox,
    orientation: text.orientation ?? 'horizontal',
    warp: text.warp?.style && text.warp.style !== 'none' ? {
      style: text.warp.style,
      value: text.warp.value ?? 0,
      perspective: text.warp.perspective ?? 0,
      perspectiveOther: text.warp.perspectiveOther ?? 0,
      rotate: text.warp.rotate ?? 'horizontal',
    } : null,
    missingFonts,
  }
}

export function psdImportWarnings(psd: Psd) {
  const warnings = new Map<string, { message: string; paths: Set<string> }>()
  const add = (code: string, message: string, path?: string) => {
    const warning = warnings.get(code) ?? { message, paths: new Set<string>() }
    if (path) warning.paths.add(path)
    warnings.set(code, warning)
  }
  const visit = (layers: Layer[], parentPath = '') => {
    layers.forEach((layer, index) => {
      const name = layer.name?.trim() || `Layer ${index + 1}`
      const path = parentPath ? `${parentPath} / ${name}` : name
      if (layer.text && !canImportPsdText(layer)) add('text', 'Complex text was rasterized', path)
      if (layer.placedLayer) add('smart-object', 'Smart objects were rasterized', path)
      const editableShape = canImportPsdShape(layer)
      if ((layer.vectorFill || layer.vectorStroke || layer.vectorOrigination) && !editableShape) add('vector', 'Complex vector shapes were rasterized', path)
      if (!layer.adjustment && ((!importableRasterMask(layer) && (layer.mask || layer.realMask)) || (layer.vectorMask && !editableShape))) add('mask', 'Unsupported masks were not preserved as editable masks', path)
      if (hasUnsupportedEffects(layer)) add('effects', 'Some Photoshop-only layer effects were not preserved', path)
      if (layer.adjustment && !canImportPsdAdjustment(layer)) add('adjustment', `Unsupported “${layer.adjustment.type}” adjustment was not preserved`, path)
      if (layer.adjustment && (layer.mask || layer.realMask || layer.vectorMask)) add('adjustment-mask', 'Adjustment-layer masks were not preserved', path)
      if (hasCustomBlending(layer)) add('advanced-blending', 'Advanced blending settings were not preserved', path)
      if (layer.blendMode && layer.blendMode !== 'pass through' && !psdBlendModes[layer.blendMode]) {
        add(`blend:${layer.blendMode}`, `Unsupported “${layer.blendMode}” blending was changed to normal`, path)
      }
      if (layer.animationFrames?.length || layer.timeline) add('animation', 'Layer animation data was not imported', path)
      if (layer.children) visit(layer.children, path)
    })
  }

  if (psd.bitsPerChannel && psd.bitsPerChannel !== 8) add('depth', `${psd.bitsPerChannel}-bit channels were converted to 8-bit raster data`)
  if (psd.colorMode !== undefined && psd.colorMode !== 3) add('color-mode', 'The source color mode was converted to RGB')
  if (psd.imageResources?.gridAndGuidesInformation?.guides?.length) add('guides', 'PSD guides were not imported')
  if (psd.imageResources?.layerComps?.list.length) add('layer-comps', 'Layer comps were not imported')
  if (psd.linkedFiles?.length) add('linked-files', 'Linked file metadata was not preserved')
  visit(psd.children ?? [])

  return [...warnings.values()].map(({ message, paths }) => {
    const names = [...paths]
    if (!names.length) return message
    const visible = names.slice(0, 3).join(', ')
    return `${message}: ${visible}${names.length > 3 ? `, and ${names.length - 3} more` : ''}`
  })
}

type PreviewLayer = { layer: Layer; hidden: boolean; opacity: number }

function previewLayers(layers: Layer[], parentHidden = false, parentOpacity = 1): PreviewLayer[] {
  return layers.flatMap((layer) => {
    const hidden = parentHidden || Boolean(layer.hidden)
    const opacity = parentOpacity * (layer.opacity ?? 1)
    return layer.children ? previewLayers(layer.children, hidden, opacity) : [{ layer, hidden, opacity }]
  })
}

function renderOrderPreview(psd: Psd, layers: PreviewLayer[], sourceIsTopToBottom: boolean, canvasCache: WeakMap<Layer, HTMLCanvasElement>) {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.setTransform(canvas.width / psd.width, 0, 0, canvas.height / psd.height, 0, 0)
  const drawOrder = sourceIsTopToBottom ? [...layers].reverse() : layers
  for (const { layer, hidden, opacity } of drawOrder) {
    if (hidden) continue
    let source = canvasCache.get(layer)
    if (!source) {
      source = layerCanvas(layer) ?? undefined
      if (source) canvasCache.set(layer, source)
    }
    if (!source) continue
    context.save()
    context.globalAlpha = opacity
    const mode = psdBlendMode(layer.blendMode)
    context.globalCompositeOperation = mode === 'normal' ? 'source-over' : mode
    context.drawImage(source, layer.left ?? 0, layer.top ?? 0)
    context.restore()
  }
  context.setTransform(1, 0, 0, 1, 0, 0)
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

function imageDifference(left: ImageData, right: ImageData) {
  let score = 0
  for (let index = 0; index < left.data.length; index += 1) score += Math.abs(left.data[index] - right.data[index])
  return score
}

function detectSourceTopToBottom(psd: Psd) {
  const composite = layerCanvas(psd)
  const children = psd.children ?? []
  if (!composite || children.length < 2) return true
  const referenceCanvas = document.createElement('canvas')
  referenceCanvas.width = 96
  referenceCanvas.height = 96
  const referenceContext = referenceCanvas.getContext('2d', { willReadFrequently: true })
  if (!referenceContext) return true
  referenceContext.drawImage(composite, 0, 0, referenceCanvas.width, referenceCanvas.height)
  const reference = referenceContext.getImageData(0, 0, referenceCanvas.width, referenceCanvas.height)
  const leaves = previewLayers(children)
  const canvasCache = new WeakMap<Layer, HTMLCanvasElement>()
  const topToBottom = renderOrderPreview(psd, leaves, true, canvasCache)
  const bottomToTop = renderOrderPreview(psd, leaves, false, canvasCache)
  if (!topToBottom || !bottomToTop) return true
  return imageDifference(topToBottom, reference) <= imageDifference(bottomToTop, reference)
}

export async function importPsdFile(file: File): Promise<{ document: EditorDocument; assets: AssetMap; warnings: string[] }> {
  initializeBrowserCanvas()
  let psd
  try {
    psd = readPsd(await file.arrayBuffer(), { skipThumbnail: true, useImageData: true })
  } catch (error) {
    throw new Error(error instanceof Error ? `PSD import failed: ${error.message}` : 'That PSD file could not be decoded.')
  }

  const assets: AssetMap = {}
  const layers: EditorLayer[] = []
  const groups: LayerGroup[] = []
  const sourceIsTopToBottom = detectSourceTopToBottom(psd)

  const importChildren = async (children: Layer[], parentId: string | null, parentPath = '') => {
    const editorOrder = sourceIsTopToBottom ? [...children].reverse() : children
    for (const [stackOrder, layer] of editorOrder.entries()) {
      const name = layer.name?.trim() || `Layer ${sourceIsTopToBottom ? children.length - stackOrder : stackOrder + 1}`
      const path = parentPath ? `${parentPath} / ${name}` : name
      if (layer.children) {
        const id = createId()
        groups.push({
          id,
          name,
          visible: !layer.hidden,
          locked: Boolean(layer.protected?.position || layer.protected?.composite),
          opacity: Math.round((layer.opacity ?? 1) * 100),
          blendMode: psdBlendMode(layer.blendMode),
          passThrough: layer.blendMode === 'pass through',
          collapsed: layer.opened === false,
          parentId,
          stackOrder,
        })
        await importChildren(layer.children, id, path)
        continue
      }
      const editableAdjustment = psdAdjustmentLayer(layer, stackOrder)
      if (editableAdjustment) {
        editableAdjustment.groupId = parentId
        editableAdjustment.stackOrder = stackOrder
        layers.push(editableAdjustment)
        continue
      }
      const editableText = psdTextLayer(layer, psd.width, psd.height)
      if (editableText) {
        editableText.effects = psdLayerEffects(layer)
        editableText.groupId = parentId
        editableText.stackOrder = stackOrder
        const mask = layer.realMask ?? layer.mask
        if (mask && !mask.disabled) {
          const maskAssetId = createId()
          const maskSource = await sourceFromMask(mask, psd.width, psd.height, `${path} mask`)
          if (maskSource) {
            assets[maskAssetId] = maskSource
            editableText.maskAssetId = maskAssetId
          }
        }
        layers.push(editableText)
        continue
      }
      const editableShape = psdShapeLayer(layer, psd.width, psd.height)
      if (editableShape) {
        editableShape.groupId = parentId
        editableShape.stackOrder = stackOrder
        const mask = layer.realMask ?? layer.mask
        if (mask && !mask.disabled) {
          const maskAssetId = createId()
          const maskSource = await sourceFromMask(mask, psd.width, psd.height, `${path} mask`)
          if (maskSource) {
            assets[maskAssetId] = maskSource
            editableShape.maskAssetId = maskAssetId
          }
        }
        layers.push(editableShape)
        continue
      }
      const canvas = layerCanvas(layer)
      if (!canvas || canvas.width === 0 || canvas.height === 0) continue
      const assetId = createId()
      assets[assetId] = await sourceFromCanvas(canvas, path)
      const left = layer.left ?? 0
      const top = layer.top ?? 0
      const centerX = left + canvas.width / 2
      const centerY = top + canvas.height / 2
      const raster = createRasterLayer(assetId, name, canvas.width, canvas.height, {
        x: (centerX - psd.width / 2) / psd.width,
        y: (centerY - psd.height / 2) / psd.height,
      })
      raster.visible = !layer.hidden
      raster.locked = Boolean(layer.protected?.position || layer.protected?.composite)
      raster.opacity = Math.round((layer.opacity ?? 1) * 100)
      raster.blendMode = psdBlendMode(layer.blendMode)
      raster.clipToBelow = Boolean(layer.clipping)
      raster.groupId = parentId
      raster.stackOrder = stackOrder
      raster.effects = psdLayerEffects(layer)
      const mask = layer.realMask ?? layer.mask
      if (mask && !mask.disabled) {
        const maskAssetId = createId()
        const maskSource = await sourceFromMask(mask, psd.width, psd.height, `${path} mask`)
        if (maskSource) {
          assets[maskAssetId] = maskSource
          raster.maskAssetId = maskAssetId
        }
      }
      layers.push(raster)
    }
  }

  await importChildren(psd.children ?? [], null)

  const composite = layerCanvas(psd)
  if (layers.length === 0 && composite) {
    const assetId = createId()
    assets[assetId] = await sourceFromCanvas(composite, file.name)
    layers.push(createRasterLayer(assetId, file.name.replace(/\.psd$/i, ''), psd.width, psd.height))
  }
  if (layers.length === 0) throw new Error('The PSD did not contain any rasterizable layer data.')

  const selectedLayerId = layers.at(-1)?.id ?? null
  return {
    assets,
    warnings: psdImportWarnings(psd),
    document: {
      ...initialDocument,
      canvasPreset: 'custom',
      canvasSize: { width: psd.width, height: psd.height },
      background: { ...initialDocument.background, kind: 'transparent' },
      groups,
      layers,
      selectedLayerId,
      selectedLayerIds: selectedLayerId ? [selectedLayerId] : [],
    },
  }
}

const studioPsdBlendModes: Record<BlendMode, NonNullable<Layer['blendMode']>> = {
  normal: 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten',
  'color-dodge': 'color dodge', 'color-burn': 'color burn', 'hard-light': 'hard light', 'soft-light': 'soft light',
  difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity',
}

function psdColor(value: string): Color {
  const normalized = value.replace('#', '')
  const expanded = normalized.length === 3 ? normalized.split('').map((channel) => `${channel}${channel}`).join('') : normalized
  const parsed = Number.parseInt(expanded, 16)
  return Number.isFinite(parsed) && expanded.length === 6
    ? { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 }
    : { r: 0, g: 0, b: 0 }
}

function canvasPixels(canvas: HTMLCanvasElement) {
  return canvas.getContext('2d', { willReadFrequently: true })?.getImageData(0, 0, canvas.width, canvas.height)
}

function exportedEffects(effects: LayerEffects | null | undefined): Layer['effects'] {
  if (!effects) return undefined
  const result: NonNullable<Layer['effects']> = {}
  if (effects.dropShadow.enabled) result.dropShadow = [{ enabled: true, color: psdColor(effects.dropShadow.color), opacity: effects.dropShadow.opacity / 100, angle: effects.dropShadow.angle, distance: { units: 'Pixels', value: effects.dropShadow.distance }, size: { units: 'Pixels', value: effects.dropShadow.blur } }]
  if (effects.outerGlow.enabled) result.outerGlow = { enabled: true, color: psdColor(effects.outerGlow.color), opacity: effects.outerGlow.opacity / 100, size: { units: 'Pixels', value: effects.outerGlow.size } }
  if (effects.colorOverlay.enabled) result.solidFill = [{ enabled: true, color: psdColor(effects.colorOverlay.color), opacity: effects.colorOverlay.opacity / 100 }]
  return Object.keys(result).length ? result : undefined
}

function exportedMask(assetId: string | null | undefined, assets: AssetMap, width: number, height: number): Layer['mask'] {
  if (!assetId) return undefined
  const source = assets[assetId]
  if (!source) return undefined
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')?.drawImage(source.surface ?? source.element, 0, 0, width, height)
  const imageData = canvasPixels(canvas)
  return imageData ? { left: 0, top: 0, right: width, bottom: height, defaultColor: 255, imageData } : undefined
}

function exportedText(layer: TextLayer, bounds: ReturnType<typeof getLayerBounds>): Layer['text'] {
  if (!bounds) return undefined
  const angle = layer.rotation * Math.PI / 180
  const styleRuns = layer.styleRuns?.slice().sort((left, right) => left.start - right.start).map((run) => ({
    length: run.length,
    style: {
      font: { name: run.fontFamily }, fontSize: run.fontSize, fauxBold: run.fontWeight === 700, fauxItalic: run.fauxItalic,
      tracking: run.fontSize ? run.letterSpacing / run.fontSize * 1000 : 0, fillColor: psdColor(run.color), leading: run.leading,
      baselineShift: run.baselineShift, horizontalScale: run.horizontalScale, verticalScale: run.verticalScale,
      underline: run.underline, strikethrough: run.strikethrough,
    },
  }))
  const paragraphStyleRuns = layer.paragraphRuns?.slice().sort((left, right) => left.start - right.start).map((run) => ({
    length: run.length,
    style: {
      justification: run.textAlign === 'justify' ? 'justify-left' as const : run.textAlign,
      firstLineIndent: run.firstLineIndent, startIndent: run.startIndent, endIndent: run.endIndent,
      spaceBefore: run.spaceBefore, spaceAfter: run.spaceAfter, autoLeading: run.leading,
    },
  }))
  return {
    text: layer.text.replace(/\n/g, '\r'), orientation: layer.orientation ?? 'horizontal',
    transform: [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0],
    left: bounds.x, top: bounds.y, right: bounds.x + bounds.width, bottom: bounds.y + bounds.height,
    shapeType: layer.paragraphBox ? 'box' : 'point', boxBounds: layer.paragraphBox ? [0, 0, layer.paragraphBox.width, layer.paragraphBox.height] : undefined,
    style: { font: { name: layer.fontFamily || 'Inter' }, fontSize: layer.fontSize, fauxBold: layer.fontWeight === 700, tracking: layer.fontSize ? layer.letterSpacing / layer.fontSize * 1000 : 0, fillColor: psdColor(layer.color) },
    paragraphStyle: { justification: layer.textAlign },
    styleRuns,
    paragraphStyleRuns,
    warp: layer.warp ? {
      style: layer.warp.style as NonNullable<NonNullable<Layer['text']>['warp']>['style'],
      value: layer.warp.value,
      perspective: layer.warp.perspective,
      perspectiveOther: layer.warp.perspectiveOther,
      rotate: layer.warp.rotate,
    } : undefined,
  }
}

function exportedShape(layer: ShapeLayer, bounds: ReturnType<typeof getLayerBounds>): Pick<Layer, 'vectorFill' | 'vectorOrigination' | 'vectorStroke'> {
  if (!bounds) return {}
  return {
    vectorFill: { type: 'color', color: psdColor(layer.fill) },
    vectorOrigination: { keyDescriptorList: [{
      keyOriginShapeBoundingBox: { left: { units: 'Pixels', value: bounds.x }, top: { units: 'Pixels', value: bounds.y }, right: { units: 'Pixels', value: bounds.x + bounds.width }, bottom: { units: 'Pixels', value: bounds.y + bounds.height } },
      keyOriginRRectRadii: { topLeft: { units: 'Pixels', value: layer.cornerRadius }, topRight: { units: 'Pixels', value: layer.cornerRadius }, bottomLeft: { units: 'Pixels', value: layer.cornerRadius }, bottomRight: { units: 'Pixels', value: layer.cornerRadius } },
    }] },
    vectorStroke: layer.strokeWidth > 0 ? { strokeEnabled: true, fillEnabled: true, lineWidth: { units: 'Pixels', value: layer.strokeWidth }, lineAlignment: 'center', lineCapType: 'butt', lineJoinType: 'miter', miterLimit: 10, content: { type: 'color', color: psdColor(layer.stroke) }, opacity: 1 } : undefined,
  }
}

function exportedAdjustment(layer: AdjustmentLayer): Layer['adjustment'] {
  if (layer.hue !== 0 || layer.saturation !== 100) return { type: 'hue/saturation', master: { a: 0, b: 0, c: 0, d: 0, hue: layer.hue, saturation: layer.saturation - 100, lightness: layer.brightness - 100 } }
  return { type: 'brightness/contrast', brightness: layer.brightness - 100, contrast: layer.contrast - 100 }
}

export async function exportPsdDocument(documentState: EditorDocument, assets: AssetMap, psb = false) {
  initializeBrowserCanvas()
  const { width, height } = getDocumentSize(documentState)
  const resources = new RenderResourceRegistry()
  const renderCanvas = (layers: EditorLayer[], includeBackground = false, renderGroups: LayerGroup[] = []) => {
    const canvas = document.createElement('canvas')
    renderComposition(canvas, {
      ...documentState,
      background: includeBackground ? documentState.background : { ...documentState.background, kind: 'transparent' },
      pattern: includeBackground ? documentState.pattern : { ...documentState.pattern, kind: 'none' },
      groups: renderGroups, layers, selectedLayerId: null, selectedLayerIds: [], selectedGroupId: null,
    }, assets, {}, resources)
    return canvas
  }
  const geometryCanvas = document.createElement('canvas')
  geometryCanvas.width = width
  geometryCanvas.height = height
  const geometryContext = geometryCanvas.getContext('2d')
  if (!geometryContext) throw new Error('PSD geometry could not be measured.')

  const exportLayer = (layer: EditorLayer): Layer => {
    const base: Layer = {
      name: layer.name, hidden: !layer.visible, opacity: layer.opacity / 100,
      blendMode: studioPsdBlendModes[layer.blendMode ?? 'normal'], clipping: Boolean(layer.clipToBelow),
      protected: layer.locked ? { position: true, composite: true } : undefined,
      mask: exportedMask(layer.maskAssetId, assets, width, height), effects: exportedEffects(layer.effects),
    }
    if (layer.type === 'adjustment') return { ...base, adjustment: exportedAdjustment(layer) }
    const rendered = renderCanvas([{ ...layer, opacity: 100, blendMode: 'normal', clipToBelow: false, maskAssetId: null, effects: null, groupId: null, stackOrder: 0 }])
    Object.assign(base, { left: 0, top: 0, right: width, bottom: height, imageData: canvasPixels(rendered) })
    const bounds = getLayerBounds(geometryContext, geometryCanvas, layer, assets)
    if (layer.type === 'text') base.text = exportedText(layer, bounds)
    if (layer.type === 'shape') Object.assign(base, exportedShape(layer, bounds))
    return base
  }

  const groups = new Map(documentState.groups.map((group) => [group.id, group]))
  const exportChildren = (parentId: string | null): Layer[] => {
    const items: Array<{ stackOrder: number; layer?: EditorLayer; group?: LayerGroup }> = [
      ...documentState.layers.filter((layer) => (layer.groupId ?? null) === parentId).map((layer) => ({ stackOrder: layer.stackOrder ?? 0, layer })),
      ...documentState.groups.filter((group) => (group.parentId ?? null) === parentId).map((group) => ({ stackOrder: group.stackOrder ?? 0, group })),
    ]
    return items.sort((left, right) => right.stackOrder - left.stackOrder).map((item) => {
      if (item.layer) return exportLayer(item.layer)
      const group = groups.get(item.group!.id)!
      return { name: group.name, hidden: !group.visible, opacity: group.opacity / 100, blendMode: group.passThrough ? 'pass through' : studioPsdBlendModes[group.blendMode], protected: group.locked ? { position: true, composite: true } : undefined, opened: !group.collapsed, children: exportChildren(group.id) }
    })
  }

  const compositeCanvas = renderCanvas(documentState.layers, true, documentState.groups)
  const imageData = canvasPixels(compositeCanvas)
  if (!imageData) throw new Error('The PSD composite could not be created.')
  const children = exportChildren(null)
  if (documentState.background.kind !== 'transparent' || documentState.pattern.kind !== 'none') {
    const backgroundCanvas = renderCanvas([], true)
    children.push({ name: 'Studio Background', left: 0, top: 0, right: width, bottom: height, imageData: canvasPixels(backgroundCanvas) })
  }
  resources.dispose()
  const buffer = writePsd({ width, height, colorMode: 3, bitsPerChannel: 8, imageData, children }, { psb, noBackground: true })
  return new Blob([buffer], { type: 'image/vnd.adobe.photoshop' })
}
