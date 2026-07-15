import { initializeCanvas, readPsd, type Color, type Layer, type LayerMaskData, type Psd } from 'ag-psd'
import { defaultLayerEffects } from './effects'
import { loadImageBlob, surfaceToBlob } from './image'
import { createAdjustmentLayer, createId, createRasterLayer, initialDocument } from './presets'
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
  if (!text || text.orientation === 'vertical' || (text.warp?.style && text.warp.style !== 'none')) return false
  if ((text.styleRuns?.length ?? 0) > 1 || (text.paragraphStyleRuns?.length ?? 0) > 1) return false
  return Boolean(text.styleRuns?.[0]?.style ?? text.style)
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
    fontWeight: bold ? 700 : semibold ? 600 : 400,
    textAlign,
    letterSpacing: (style.tracking ?? 0) * fontSize / 1000,
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
