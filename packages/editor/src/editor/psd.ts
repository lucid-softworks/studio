import { initializeCanvas, readPsd, writePsd, type Color, type ImageResources, type Layer, type LayerMaskData, type LinkedFile, type PlacedLayer, type Psd } from 'ag-psd'
import { defaultLayerEffects, normalizeLayerEffects } from './effects'
import { defaultLayerFilters, normalizeLayerFilters } from './filters'
import { createAdjustmentLayer, createId, createRasterLayer, getDocumentSize, initialDocument } from './presets'
import { renderComposition, getLayerBounds, parseColorLookupLut } from './renderer'
import { RenderResourceRegistry } from './rendering/render-resource-registry'
import type { AssetMap, SourceImage } from './runtime-assets'
import type { AdjustmentDescriptor, AdjustmentLayer, BlendIfSettings, BlendMode, EditorDocument, EditorLayer, LayerEffects, LayerGroup, LayerMaskSettings, Position, SerializedPsdValue, ShapeLayer, TextLayer, VectorMask } from './types'

let initialized = false

function serializePsdValue(value: unknown): SerializedPsdValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Uint8Array) return { __studioBytes: [...value] }
  if (Array.isArray(value)) return value.map(serializePsdValue)
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, serializePsdValue(entry)]))
  return null
}

function revivePsdValue(value: SerializedPsdValue): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(revivePsdValue)
  if (Array.isArray(value.__studioBytes)) return Uint8Array.from(value.__studioBytes as number[])
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, revivePsdValue(entry)]))
}

function preservedImageResources(resources: ImageResources | undefined) {
  if (!resources) return undefined
  const keys = [
    'versionInfo', 'globalAngle', 'globalAltitude', 'pixelAspectRatio', 'urlsList', 'gridAndGuidesInformation',
    'resolutionInfo', 'captionDigest', 'xmpMetadata', 'printScale', 'printInformation', 'backgroundColor',
    'idsSeedNumber', 'printFlags', 'iccUntaggedProfile', 'pathSelectionState', 'slices', 'layerComps',
  ] as const
  const selected = Object.fromEntries(keys.flatMap((key) => resources[key] === undefined ? [] : [[key, resources[key]]]))
  return Object.keys(selected).length ? serializePsdValue(selected) : undefined
}

function psdCompositeOffset(buffer: ArrayBuffer) {
  const view = new DataView(buffer)
  const psb = view.getUint16(4) === 2
  let offset = 26
  const skipSection = (large = false) => {
    const length = large ? Number(view.getBigUint64(offset)) : view.getUint32(offset)
    offset += (large ? 8 : 4) + length
  }
  skipSection()
  skipSection()
  skipSection(psb)
  return { offset, psb }
}

function decodePackBitsRow(input: Uint8Array, expected: number) {
  const output = new Uint8Array(expected)
  let source = 0
  let target = 0
  while (source < input.length && target < expected) {
    const header = input[source++]
    if (header <= 127) {
      const count = header + 1
      output.set(input.subarray(source, source + count), target)
      source += count
      target += count
    } else if (header >= 129) {
      const count = 257 - header
      output.fill(input[source++] ?? 0, target, target + count)
      target += count
    }
  }
  return output
}

function decodeCompositePlanes(buffer: ArrayBuffer, width: number, height: number, channels: number, bitsPerChannel: number) {
  const { offset, psb } = psdCompositeOffset(buffer)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const compression = view.getUint16(offset)
  const bytesPerSample = Math.max(1, bitsPerChannel / 8)
  const rowBytes = width * bytesPerSample
  const planes = Array.from({ length: channels }, () => new Uint8Array(rowBytes * height))
  if (compression === 0) {
    let source = offset + 2
    for (const plane of planes) {
      plane.set(bytes.subarray(source, source + plane.length))
      source += plane.length
    }
    return planes
  }
  if (compression !== 1) return []
  const lengthSize = psb ? 4 : 2
  const lengths: number[] = []
  let cursor = offset + 2
  for (let index = 0; index < channels * height; index += 1) {
    lengths.push(lengthSize === 4 ? view.getUint32(cursor) : view.getUint16(cursor))
    cursor += lengthSize
  }
  for (let channel = 0; channel < channels; channel += 1) {
    for (let row = 0; row < height; row += 1) {
      const length = lengths[channel * height + row]
      planes[channel].set(decodePackBitsRow(bytes.subarray(cursor, cursor + length), rowBytes), row * rowBytes)
      cursor += length
    }
  }
  return planes
}

function channelPlaneToCanvas(plane: Uint8Array, width: number, height: number, bitsPerChannel: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null
  const pixels = new ImageData(width, height)
  const view = new DataView(plane.buffer, plane.byteOffset, plane.byteLength)
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const value = bitsPerChannel === 16
      ? view.getUint16(pixel * 2) / 257
      : bitsPerChannel === 32
        ? Math.max(0, Math.min(255, view.getFloat32(pixel * 4) * 255))
        : plane[pixel]
    const target = pixel * 4
    pixels.data[target] = value
    pixels.data[target + 1] = value
    pixels.data[target + 2] = value
    pixels.data[target + 3] = 255
  }
  context.putImageData(pixels, 0, 0)
  return canvas
}

function precisionFromChannelPlane(plane: Uint8Array, width: number, height: number, bitDepth: number): SourceImage['precision'] {
  if (bitDepth !== 16 && bitDepth !== 32) return undefined
  const view = new DataView(plane.buffer, plane.byteOffset, plane.byteLength)
  const data = bitDepth === 16 ? new Uint16Array(width * height * 4) : new Float32Array(width * height * 4)
  const maximum = bitDepth === 16 ? 0xffff : 1
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const value = bitDepth === 16 ? view.getUint16(pixel * 2) : view.getFloat32(pixel * 4)
    data[pixel * 4] = value
    data[pixel * 4 + 1] = value
    data[pixel * 4 + 2] = value
    data[pixel * 4 + 3] = maximum
  }
  return { bitDepth, width, height, data, revision: 0 } as NonNullable<SourceImage['precision']>
}

function encodeCanvasPlane(pixels: ImageData, channel: number, bitDepth: 8 | 16 | 32, linear = false) {
  const bytesPerSample = bitDepth / 8
  const plane = new Uint8Array(pixels.width * pixels.height * bytesPerSample)
  const view = new DataView(plane.buffer)
  for (let pixel = 0; pixel < pixels.width * pixels.height; pixel += 1) {
    const byte = pixels.data[pixel * 4 + channel]
    if (bitDepth === 8) plane[pixel] = byte
    else if (bitDepth === 16) view.setUint16(pixel * 2, byte * 257)
    else view.setFloat32(pixel * 4, linear ? byte / 255 : Math.pow(byte / 255, 2.2))
  }
  return plane
}

function encodePrecisionPlane(precision: NonNullable<SourceImage['precision']>, channel: number) {
  const bytesPerSample = precision.bitDepth / 8
  const plane = new Uint8Array(precision.width * precision.height * bytesPerSample)
  const view = new DataView(plane.buffer)
  for (let pixel = 0; pixel < precision.width * precision.height; pixel += 1) {
    const value = precision.data[pixel * 4 + channel]
    if (precision.bitDepth === 16) view.setUint16(pixel * 2, value)
    else view.setFloat32(pixel * 4, value)
  }
  return plane
}

function rawChannel(id: number, data: Uint8Array): NonNullable<Layer['rawData']>['channels'][number] {
  return { id: id as NonNullable<Layer['rawData']>['channels'][number]['id'], compression: 0 as NonNullable<Layer['rawData']>['channels'][number]['compression'], data }
}

function rawLayerData(bitDepth: 16 | 32, psb: boolean, pixels?: ImageData, precision?: NonNullable<SourceImage['precision']>, mask?: LayerMaskData): NonNullable<Layer['rawData']> {
  const channels = precision
    ? [rawChannel(0, encodePrecisionPlane(precision, 0)), rawChannel(1, encodePrecisionPlane(precision, 1)), rawChannel(2, encodePrecisionPlane(precision, 2)), rawChannel(-1, encodePrecisionPlane(precision, 3))]
    : pixels
      ? [rawChannel(0, encodeCanvasPlane(pixels, 0, bitDepth)), rawChannel(1, encodeCanvasPlane(pixels, 1, bitDepth)), rawChannel(2, encodeCanvasPlane(pixels, 2, bitDepth)), rawChannel(-1, encodeCanvasPlane(pixels, 3, bitDepth, true))]
      : []
  if (mask?.imageData) {
    const maskPixels = new ImageData(new Uint8ClampedArray(mask.imageData.data), mask.imageData.width, mask.imageData.height)
    channels.push(rawChannel(-2, encodeCanvasPlane(maskPixels, 0, bitDepth, true)))
  }
  return { colorMode: 3, bitsPerChannel: bitDepth, channels, large: psb }
}

function replaceCompositeChannels(buffer: ArrayBuffer, width: number, height: number, pixels: ImageData, channelSources: SourceImage[], bitDepth: 8 | 16 | 32) {
  const view = new DataView(buffer)
  const originalChannelCount = view.getUint16(12)
  const planes = [
    encodeCanvasPlane(pixels, 0, bitDepth),
    encodeCanvasPlane(pixels, 1, bitDepth),
    encodeCanvasPlane(pixels, 2, bitDepth),
    ...(originalChannelCount === 4 ? [encodeCanvasPlane(pixels, 3, bitDepth, true)] : []),
  ]
  for (const source of channelSources) {
    const precision = source.precision
    if (precision?.bitDepth === bitDepth && precision.revision === (source.revision ?? 0) && precision.width === width && precision.height === height) {
      planes.push(encodePrecisionPlane(precision, 0))
      continue
    }
    const surface = source.surface
    if (!surface) continue
    const channelPixels = surface.getContext('2d', { willReadFrequently: true })?.getImageData(0, 0, width, height)
    if (channelPixels) planes.push(encodeCanvasPlane(channelPixels, 0, bitDepth, true))
  }
  const { offset } = psdCompositeOffset(buffer)
  const output = new Uint8Array(offset + 2 + planes.reduce((total, plane) => total + plane.length, 0))
  output.set(new Uint8Array(buffer, 0, offset))
  new DataView(output.buffer).setUint16(12, planes.length)
  new DataView(output.buffer).setUint16(22, bitDepth)
  new DataView(output.buffer).setUint16(offset, 0)
  let cursor = offset + 2
  for (const plane of planes) {
    output.set(plane, cursor)
    cursor += plane.length
  }
  return output.buffer
}

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

function precisionFromImageData(imageData: Layer['imageData'] | Psd['imageData'], bitsPerChannel: number): SourceImage['precision'] {
  if (bitsPerChannel === 16 && imageData?.data instanceof Uint16Array) {
    return { bitDepth: 16, width: imageData.width, height: imageData.height, data: imageData.data.slice(), revision: 0 }
  }
  if (bitsPerChannel === 32 && imageData?.data instanceof Float32Array) {
    return { bitDepth: 32, width: imageData.width, height: imageData.height, data: imageData.data.slice(), revision: 0 }
  }
  return undefined
}

async function sourceFromCanvas(canvas: HTMLCanvasElement, name: string, precision?: SourceImage['precision']) {
  return { element: canvas as unknown as HTMLImageElement, name, surface: canvas, revision: 0, precision }
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
    const source = layer.imageData.data
    let data: Uint8ClampedArray
    if (source instanceof Uint16Array) {
      data = new Uint8ClampedArray(source.length)
      for (let index = 0; index < source.length; index += 1) data[index] = source[index] >>> 8
    } else if (source instanceof Float32Array) {
      data = new Uint8ClampedArray(source.length)
      for (let index = 0; index < source.length; index += 4) {
        data[index] = Math.round(Math.pow(Math.max(0, source[index]), 1 / 2.2) * 255)
        data[index + 1] = Math.round(Math.pow(Math.max(0, source[index + 1]), 1 / 2.2) * 255)
        data[index + 2] = Math.round(Math.pow(Math.max(0, source[index + 2]), 1 / 2.2) * 255)
        data[index + 3] = Math.round(Math.max(0, Math.min(1, source[index + 3])) * 255)
      }
    } else data = new Uint8ClampedArray(source)
    const imageBytes = new Uint8ClampedArray(data.length)
    imageBytes.set(data)
    const pixels = new ImageData(imageBytes, layer.imageData.width, layer.imageData.height)
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

function isDefaultBlendingRange(range: number[]) {
  return range.length === 4 && range[0] === 0 && range[1] === 0 && range[2] === 255 && range[3] === 255
}

export function psdBlendIf(layer: Layer): BlendIfSettings | undefined {
  const ranges = layer.blendingRanges
  if (!ranges) return undefined
  if (isDefaultBlendingRange(ranges.compositeGrayBlendSource)
    && isDefaultBlendingRange(ranges.compositeGraphBlendDestinationRange)
    && ranges.ranges.every((range) => isDefaultBlendingRange(range.sourceRange) && isDefaultBlendingRange(range.destRange))) return undefined
  return {
    source: [...ranges.compositeGrayBlendSource],
    destination: [...ranges.compositeGraphBlendDestinationRange],
    channels: ranges.ranges.map((range) => ({ source: [...range.sourceRange], destination: [...range.destRange] })),
  }
}

function hasUnsupportedAdvancedBlending(layer: Layer) {
  return Boolean(layer.knockout)
}

function canPreviewColorLookup(adjustment: Extract<NonNullable<Layer['adjustment']>, { type: 'color lookup' }>) {
  return Boolean(parseColorLookupLut(psdAdjustmentDescriptor(adjustment) as Extract<AdjustmentDescriptor, { type: 'color lookup' }>))
}

function importableRasterMask(layer: Layer) {
  const mask = layer.realMask ?? layer.mask
  return Boolean(mask && !mask.disabled && (mask.imageData || mask.canvas))
}

export function psdMaskSettings(layer: Layer): LayerMaskSettings | undefined {
  const mask = layer.realMask ?? layer.mask
  if (!mask || (!mask.imageData && !mask.canvas && mask.userMaskDensity === undefined && mask.userMaskFeather === undefined)) return undefined
  return {
    density: Math.round((mask.userMaskDensity ?? 1) * 100),
    feather: mask.userMaskFeather ?? 0,
    linked: mask.positionRelativeToLayer !== false,
  }
}

export function psdVectorMask(layer: Layer, documentWidth: number, documentHeight: number): VectorMask | undefined {
  const vector = layer.vectorMask
  if (!vector) return undefined
  const mask = layer.realMask ?? layer.mask
  const coordinate = (value: number, size: number) => Math.abs(value) <= 2 && size > 2 ? value : value / size
  return {
    paths: vector.paths.map((path) => ({
      closed: !path.open,
      operation: path.operation ?? 'combine',
      fillRule: path.fillRule,
      knots: path.knots.map((knot) => ({
        linked: knot.linked,
        in: { x: coordinate(knot.points[0], documentWidth), y: coordinate(knot.points[1], documentHeight) },
        anchor: { x: coordinate(knot.points[2], documentWidth), y: coordinate(knot.points[3], documentHeight) },
        out: { x: coordinate(knot.points[4], documentWidth), y: coordinate(knot.points[5], documentHeight) },
      })),
    })),
    density: Math.round((mask?.vectorMaskDensity ?? 1) * 100),
    feather: mask?.vectorMaskFeather ?? 0,
    inverted: Boolean(vector.invert),
    disabled: Boolean(vector.disable),
    linked: !vector.notLink,
    fillStartsWithAllPixels: Boolean(vector.fillStartsWithAllPixels),
  }
}

function applyPsdLayerMetadata(target: EditorLayer, source: Layer, documentWidth: number, documentHeight: number, includeVectorMask = true) {
  const settings = psdMaskSettings(source)
  if (settings) target.maskSettings = settings
  if (includeVectorMask) target.vectorMask = psdVectorMask(source, documentWidth, documentHeight)
  target.blendIf = psdBlendIf(source)
  target.psdLayerId = source.id
  target.psdPlacedLayer = source.placedLayer ? serializePsdValue(source.placedLayer) : undefined
  target.additionalEffects = psdAdditionalLayerEffects(source)
  target.psdEffectsMetadata = source.effects ? serializePsdValue(source.effects) : undefined
}

function effectEnabled(effect: { enabled?: boolean; present?: boolean } | undefined) {
  return Boolean(effect && effect.enabled !== false && effect.present !== false)
}

export function psdLayerEffects(layer: Layer): LayerEffects | null {
  const effects = layer.effects
  if (!effects || effects.disabled) return null
  const dropShadow = effects.dropShadow?.find(effectEnabled)
  const innerShadow = effects.innerShadow?.find(effectEnabled)
  const outerGlow = effectEnabled(effects.outerGlow) ? effects.outerGlow : undefined
  const innerGlow = effectEnabled(effects.innerGlow) ? effects.innerGlow : undefined
  const bevel = effectEnabled(effects.bevel) ? effects.bevel : undefined
  const satin = effectEnabled(effects.satin) ? effects.satin : undefined
  const colorOverlay = effects.solidFill?.find(effectEnabled)
  const gradientOverlay = effects.gradientOverlay?.find(effectEnabled)
  const patternOverlay = effectEnabled(effects.patternOverlay) ? effects.patternOverlay : undefined
  const stroke = effects.stroke?.find(effectEnabled)
  if (!dropShadow && !innerShadow && !outerGlow && !innerGlow && !bevel && !satin && !colorOverlay && !gradientOverlay && !patternOverlay && !stroke) return null
  const gradient = gradientOverlay?.gradient
  return {
    ...defaultLayerEffects,
    dropShadow: {
      enabled: Boolean(dropShadow),
      color: colorHex(dropShadow?.color),
      opacity: Math.round((dropShadow?.opacity ?? 1) * 100),
      angle: dropShadow?.angle ?? defaultLayerEffects.dropShadow.angle,
      distance: dropShadow?.distance?.value ?? defaultLayerEffects.dropShadow.distance,
      blur: dropShadow?.size?.value ?? defaultLayerEffects.dropShadow.blur,
      spread: dropShadow?.choke?.value ?? defaultLayerEffects.dropShadow.spread,
      blendMode: psdBlendMode(dropShadow?.blendMode),
    },
    innerShadow: {
      enabled: Boolean(innerShadow), color: innerShadow ? colorHex(innerShadow.color) : defaultLayerEffects.innerShadow.color, opacity: Math.round((innerShadow?.opacity ?? 1) * 100),
      angle: innerShadow?.angle ?? defaultLayerEffects.innerShadow.angle, distance: innerShadow?.distance?.value ?? defaultLayerEffects.innerShadow.distance,
      blur: innerShadow?.size?.value ?? defaultLayerEffects.innerShadow.blur, choke: innerShadow?.choke?.value ?? defaultLayerEffects.innerShadow.choke,
      blendMode: psdBlendMode(innerShadow?.blendMode),
    },
    outerGlow: {
      enabled: Boolean(outerGlow),
      color: outerGlow ? colorHex(outerGlow.color) : defaultLayerEffects.outerGlow.color,
      opacity: Math.round((outerGlow?.opacity ?? 1) * 100),
      size: outerGlow?.size?.value ?? defaultLayerEffects.outerGlow.size,
      spread: outerGlow?.choke?.value ?? defaultLayerEffects.outerGlow.spread,
      blendMode: psdBlendMode(outerGlow?.blendMode),
    },
    innerGlow: {
      enabled: Boolean(innerGlow), color: innerGlow ? colorHex(innerGlow.color) : defaultLayerEffects.innerGlow.color, opacity: Math.round((innerGlow?.opacity ?? 1) * 100),
      size: innerGlow?.size?.value ?? defaultLayerEffects.innerGlow.size, choke: innerGlow?.choke?.value ?? defaultLayerEffects.innerGlow.choke,
      source: innerGlow?.source ?? defaultLayerEffects.innerGlow.source, blendMode: psdBlendMode(innerGlow?.blendMode),
    },
    bevel: {
      enabled: Boolean(bevel), size: bevel?.size?.value ?? defaultLayerEffects.bevel.size, depth: bevel?.strength ?? defaultLayerEffects.bevel.depth,
      angle: bevel?.angle ?? defaultLayerEffects.bevel.angle, altitude: bevel?.altitude ?? defaultLayerEffects.bevel.altitude,
      highlightColor: colorHex(bevel?.highlightColor), highlightOpacity: Math.round((bevel?.highlightOpacity ?? 1) * 100),
      shadowColor: colorHex(bevel?.shadowColor ?? { r: 0, g: 0, b: 0 }), shadowOpacity: Math.round((bevel?.shadowOpacity ?? 1) * 100),
      style: bevel?.style ?? defaultLayerEffects.bevel.style, direction: bevel?.direction ?? defaultLayerEffects.bevel.direction,
    },
    satin: {
      enabled: Boolean(satin), color: satin ? colorHex(satin.color) : defaultLayerEffects.satin.color, opacity: Math.round((satin?.opacity ?? 1) * 100), angle: satin?.angle ?? defaultLayerEffects.satin.angle,
      distance: satin?.distance?.value ?? defaultLayerEffects.satin.distance, size: satin?.size?.value ?? defaultLayerEffects.satin.size,
      invert: Boolean(satin?.invert), blendMode: psdBlendMode(satin?.blendMode),
    },
    colorOverlay: {
      enabled: Boolean(colorOverlay),
      color: colorHex(colorOverlay?.color),
      opacity: Math.round((colorOverlay?.opacity ?? 1) * 100),
      blendMode: psdBlendMode(colorOverlay?.blendMode),
    },
    gradientOverlay: {
      enabled: Boolean(gradientOverlay), opacity: Math.round((gradientOverlay?.opacity ?? 1) * 100), angle: gradientOverlay?.angle ?? defaultLayerEffects.gradientOverlay.angle,
      scale: gradientOverlay?.scale ?? defaultLayerEffects.gradientOverlay.scale, style: gradientOverlay?.type ?? defaultLayerEffects.gradientOverlay.style,
      reverse: Boolean(gradientOverlay?.reverse), blendMode: psdBlendMode(gradientOverlay?.blendMode as Layer['blendMode']), name: gradient?.name ?? defaultLayerEffects.gradientOverlay.name,
      gradientType: gradient?.type ?? 'solid',
      colorStops: gradient?.type === 'solid' ? gradient.colorStops.map((stop) => ({ color: colorHex(stop.color), position: stop.location > 1 ? stop.location / 4096 : stop.location })) : defaultLayerEffects.gradientOverlay.colorStops,
      opacityStops: gradient?.type === 'solid' ? gradient.opacityStops.map((stop) => ({ opacity: stop.opacity, position: stop.location > 1 ? stop.location / 4096 : stop.location })) : defaultLayerEffects.gradientOverlay.opacityStops,
      roughness: gradient?.type === 'noise' ? gradient.roughness ?? 50 : defaultLayerEffects.gradientOverlay.roughness,
      randomSeed: gradient?.type === 'noise' ? gradient.randomSeed ?? 1 : defaultLayerEffects.gradientOverlay.randomSeed,
      colorModel: gradient?.type === 'noise' ? gradient.colorModel ?? 'rgb' : defaultLayerEffects.gradientOverlay.colorModel,
      restrictColors: gradient?.type === 'noise' ? gradient.restrictColors ?? false : defaultLayerEffects.gradientOverlay.restrictColors,
      addTransparency: gradient?.type === 'noise' ? gradient.addTransparency ?? false : defaultLayerEffects.gradientOverlay.addTransparency,
      min: gradient?.type === 'noise' ? gradient.min : defaultLayerEffects.gradientOverlay.min,
      max: gradient?.type === 'noise' ? gradient.max : defaultLayerEffects.gradientOverlay.max,
    },
    patternOverlay: {
      enabled: Boolean(patternOverlay), opacity: Math.round((patternOverlay?.opacity ?? 1) * 100), scale: patternOverlay?.scale ?? 100,
      blendMode: psdBlendMode(patternOverlay?.blendMode), id: patternOverlay?.pattern?.id ?? '', name: patternOverlay?.pattern?.name ?? 'Pattern',
      phase: patternOverlay?.phase ?? { x: 0, y: 0 }, linked: patternOverlay?.align ?? true,
    },
    stroke: {
      enabled: Boolean(stroke), color: stroke ? colorHex(stroke.color) : defaultLayerEffects.stroke.color, opacity: Math.round((stroke?.opacity ?? 1) * 100), size: stroke?.size?.value ?? 3,
      position: stroke?.position ?? 'outside', blendMode: psdBlendMode(stroke?.blendMode), fillType: stroke?.fillType ?? 'color',
      gradient: stroke?.gradient ? {
        angle: stroke.gradient.angle ?? 90, scale: stroke.gradient.scale ?? 100, style: stroke.gradient.style ?? 'linear', reverse: stroke.gradient.reverse ?? false,
        name: stroke.gradient.name, gradientType: stroke.gradient.type,
        colorStops: stroke.gradient.type === 'solid' ? stroke.gradient.colorStops.map((stop) => ({ color: colorHex(stop.color), position: stop.location > 1 ? stop.location / 4096 : stop.location })) : defaultLayerEffects.stroke.gradient.colorStops,
        opacityStops: stroke.gradient.type === 'solid' ? stroke.gradient.opacityStops.map((stop) => ({ opacity: stop.opacity, position: stop.location > 1 ? stop.location / 4096 : stop.location })) : defaultLayerEffects.stroke.gradient.opacityStops,
        roughness: stroke.gradient.type === 'noise' ? stroke.gradient.roughness ?? 50 : 50, randomSeed: stroke.gradient.type === 'noise' ? stroke.gradient.randomSeed ?? 1 : 1,
        colorModel: stroke.gradient.type === 'noise' ? stroke.gradient.colorModel ?? 'rgb' : 'rgb', restrictColors: stroke.gradient.type === 'noise' ? stroke.gradient.restrictColors ?? false : false,
        addTransparency: stroke.gradient.type === 'noise' ? stroke.gradient.addTransparency ?? false : false,
        min: stroke.gradient.type === 'noise' ? stroke.gradient.min : [0, 0, 0, 0], max: stroke.gradient.type === 'noise' ? stroke.gradient.max : [1, 1, 1, 1],
      } : defaultLayerEffects.stroke.gradient,
      pattern: stroke?.pattern ? { ...defaultLayerEffects.stroke.pattern, id: stroke.pattern.id, name: stroke.pattern.name } : defaultLayerEffects.stroke.pattern,
    },
  }
}

function psdAdditionalLayerEffects(layer: Layer) {
  const effects = layer.effects
  if (!effects || effects.disabled) return []
  const entries: Array<Layer['effects']> = [
    ...(effects.dropShadow?.slice(1).map((effect) => ({ dropShadow: [effect] })) ?? []),
    ...(effects.innerShadow?.slice(1).map((effect) => ({ innerShadow: [effect] })) ?? []),
    ...(effects.solidFill?.slice(1).map((effect) => ({ solidFill: [effect] })) ?? []),
    ...(effects.gradientOverlay?.slice(1).map((effect) => ({ gradientOverlay: [effect] })) ?? []),
    ...(effects.stroke?.slice(1).map((effect) => ({ stroke: [effect] })) ?? []),
  ]
  return entries.map((value) => psdLayerEffects({ effects: value })).filter((value): value is LayerEffects => Boolean(value))
}

function psdShapeGeometry(layer: Layer, documentWidth = 1, documentHeight = 1) {
  if (!layer.vectorFill) return null
  const origin = layer.vectorOrigination?.keyDescriptorList.find((item) => item.keyOriginShapeBoundingBox)
  const paths = layer.vectorMask?.paths.filter((path) => path.knots.length > 0) ?? []
  if (!origin && paths.length === 0) return null
  const coordinate = (value: number, size: number) => Math.abs(value) <= 2 && size > 2 ? value * size : value
  const anchors = paths.flatMap((path) => path.knots.map((knot) => ({ x: coordinate(knot.points[2], documentWidth), y: coordinate(knot.points[3], documentHeight) })))
  const box = origin?.keyOriginShapeBoundingBox
  const left = box?.left.value ?? Math.min(...anchors.map((point) => point.x))
  const top = box?.top.value ?? Math.min(...anchors.map((point) => point.y))
  const right = box?.right.value ?? Math.max(...anchors.map((point) => point.x))
  const bottom = box?.bottom.value ?? Math.max(...anchors.map((point) => point.y))
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) return null
  const rounded = origin?.keyOriginRRectRadii
  const curved = paths[0]?.knots.some((knot) => (
    Math.abs(knot.points[0] - knot.points[2]) > 0.01
    || Math.abs(knot.points[1] - knot.points[3]) > 0.01
    || Math.abs(knot.points[4] - knot.points[2]) > 0.01
    || Math.abs(knot.points[5] - knot.points[3]) > 0.01
  ))
  const cornerRadius = rounded
    ? Math.max(rounded.topLeft.value, rounded.topRight.value, rounded.bottomLeft.value, rounded.bottomRight.value)
    : 0
  const custom = paths.length > 1 || (paths.length === 1 && (paths[0].knots.length !== 4 || paths[0].open || paths[0].operation === 'subtract' || paths[0].operation === 'intersect'))
  return { left, top, right, bottom, shape: custom ? 'path' as const : curved && !rounded ? 'ellipse' as const : 'rectangle' as const, cornerRadius, transform: origin?.transform, paths, coordinate }
}

export function canImportPsdShape(layer: Layer, documentWidth?: number, documentHeight?: number) {
  return Boolean(psdShapeGeometry(layer, documentWidth, documentHeight))
}

export function psdShapeLayer(layer: Layer, documentWidth: number, documentHeight: number): ShapeLayer | null {
  const geometry = psdShapeGeometry(layer, documentWidth, documentHeight)
  if (!geometry || !layer.vectorFill) return null
  const stroke = layer.vectorStroke
  const strokeColor = stroke?.content?.type === 'color' ? stroke.content.color : undefined
  const transform = geometry.transform ?? [1, 0, 0, 1, 0, 0]
  const fillStyle: ShapeLayer['fillStyle'] = layer.vectorFill.type === 'color'
    ? { type: 'color', color: colorHex(layer.vectorFill.color) }
    : layer.vectorFill.type === 'pattern'
      ? { type: 'pattern', id: layer.vectorFill.id, name: layer.vectorFill.name, scale: 100, linked: layer.vectorFill.linked ?? true, phase: layer.vectorFill.phase ?? { x: 0, y: 0 } }
      : layer.vectorFill.type === 'solid'
        ? {
            type: 'gradient', name: layer.vectorFill.name, style: layer.vectorFill.style ?? 'linear', angle: layer.vectorFill.angle ?? 0, scale: layer.vectorFill.scale ?? 100,
            colorStops: layer.vectorFill.colorStops.map((stop) => ({ color: colorHex(stop.color), position: stop.location > 1 ? stop.location / 4096 : stop.location })),
            opacityStops: layer.vectorFill.opacityStops.map((stop) => ({ opacity: stop.opacity, position: stop.location > 1 ? stop.location / 4096 : stop.location })),
          }
        : undefined
  const fallbackFill = fillStyle?.type === 'color' ? fillStyle.color : fillStyle?.type === 'gradient' ? fillStyle.colorStops[0]?.color ?? '#ffffff' : '#ffffff'
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
    fill: fallbackFill,
    stroke: colorHex(strokeColor),
    strokeWidth: stroke?.strokeEnabled ? stroke.lineWidth?.value ?? 1 : 0,
    cornerRadius: geometry.cornerRadius,
    vectorPaths: geometry.shape === 'path' ? geometry.paths.map((path) => ({
      closed: !path.open,
      operation: path.operation ?? 'combine',
      fillRule: path.fillRule,
      knots: path.knots.map((knot) => ({
        linked: knot.linked,
        in: { x: (geometry.coordinate(knot.points[0], documentWidth) - geometry.left) / (geometry.right - geometry.left), y: (geometry.coordinate(knot.points[1], documentHeight) - geometry.top) / (geometry.bottom - geometry.top) },
        anchor: { x: (geometry.coordinate(knot.points[2], documentWidth) - geometry.left) / (geometry.right - geometry.left), y: (geometry.coordinate(knot.points[3], documentHeight) - geometry.top) / (geometry.bottom - geometry.top) },
        out: { x: (geometry.coordinate(knot.points[4], documentWidth) - geometry.left) / (geometry.right - geometry.left), y: (geometry.coordinate(knot.points[5], documentHeight) - geometry.top) / (geometry.bottom - geometry.top) },
      })),
    })) : undefined,
    fillStyle,
    strokeStyle: stroke ? {
      alignment: stroke.lineAlignment ?? 'center', cap: stroke.lineCapType ?? 'butt', join: stroke.lineJoinType ?? 'miter',
      miterLimit: stroke.miterLimit ?? 10, dashOffset: stroke.lineDashOffset?.value ?? 0,
      dashes: stroke.lineDashSet?.map((dash) => dash.value) ?? [], opacity: stroke.opacity ?? 1,
      blendMode: psdBlendMode(stroke.blendMode),
    } : undefined,
    effects: psdLayerEffects(layer),
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

export function canImportPsdAdjustment(layer: Layer) {
  return Boolean(layer.adjustment)
}

function psdAdjustmentDescriptor(source: NonNullable<Layer['adjustment']>): AdjustmentDescriptor {
  const preset = 'presetKind' in source ? { presetKind: source.presetKind, presetFileName: source.presetFileName } : {}
  switch (source.type) {
    case 'brightness/contrast': return { type: source.type, brightness: source.brightness ?? 0, contrast: source.contrast ?? 0, meanValue: source.meanValue, useLegacy: source.useLegacy ?? false, labColorOnly: source.labColorOnly ?? false, auto: source.auto ?? false }
    case 'levels': return { type: source.type, rgb: source.rgb, red: source.red, green: source.green, blue: source.blue, ...preset }
    case 'curves': return { type: source.type, rgb: source.rgb, red: source.red, green: source.green, blue: source.blue, ...preset }
    case 'exposure': return { type: source.type, exposure: source.exposure ?? 0, offset: source.offset ?? 0, gamma: source.gamma ?? 1, ...preset }
    case 'vibrance': return { type: source.type, vibrance: source.vibrance ?? 0, saturation: source.saturation ?? 0 }
    case 'hue/saturation': {
      const channel = (value: typeof source.master) => value ? { range: [value.a, value.b, value.c, value.d] as [number, number, number, number], hue: value.hue, saturation: value.saturation, lightness: value.lightness } : undefined
      return { type: source.type, master: channel(source.master), reds: channel(source.reds), yellows: channel(source.yellows), greens: channel(source.greens), cyans: channel(source.cyans), blues: channel(source.blues), magentas: channel(source.magentas), ...preset }
    }
    case 'color balance': return { type: source.type, shadows: source.shadows, midtones: source.midtones, highlights: source.highlights, preserveLuminosity: source.preserveLuminosity ?? true }
    case 'black & white': return { type: source.type, reds: source.reds ?? 40, yellows: source.yellows ?? 60, greens: source.greens ?? 40, cyans: source.cyans ?? 60, blues: source.blues ?? 20, magentas: source.magentas ?? 80, useTint: source.useTint ?? false, tintColor: colorHex(source.tintColor), ...preset }
    case 'photo filter': return { type: source.type, color: colorHex(source.color), density: source.density ?? 25, preserveLuminosity: source.preserveLuminosity ?? true }
    case 'channel mixer': return { type: source.type, monochrome: source.monochrome ?? false, red: source.red, green: source.green, blue: source.blue, gray: source.gray, ...preset }
    case 'color lookup': return { type: source.type, lookupType: source.lookupType, name: source.name, dither: source.dither ?? false, profile: source.profile ? [...source.profile] : undefined, lutFormat: source.lutFormat, dataOrder: source.dataOrder, tableOrder: source.tableOrder, lut3DFileData: source.lut3DFileData ? [...source.lut3DFileData] : undefined, lut3DFileName: source.lut3DFileName }
    case 'invert': return { type: source.type }
    case 'posterize': return { type: source.type, levels: source.levels ?? 4 }
    case 'threshold': return { type: source.type, level: source.level ?? 128 }
    case 'gradient map': return { type: source.type, name: source.name ?? 'Gradient Map', gradientType: source.gradientType, dither: source.dither ?? false, reverse: source.reverse ?? false, method: source.method, smoothness: source.smoothness, colorStops: source.colorStops?.map((stop) => ({ color: colorHex(stop.color), position: stop.location > 1 ? stop.location / 4096 : stop.location, midpoint: stop.midpoint })), opacityStops: source.opacityStops?.map((stop) => ({ opacity: stop.opacity, position: stop.location > 1 ? stop.location / 4096 : stop.location, midpoint: stop.midpoint })), roughness: source.roughness, colorModel: source.colorModel, randomSeed: source.randomSeed, restrictColors: source.restrictColors, addTransparency: source.addTransparency, min: source.min, max: source.max }
    case 'selective color': return { type: source.type, mode: source.mode ?? 'relative', reds: source.reds, yellows: source.yellows, greens: source.greens, cyans: source.cyans, blues: source.blues, magentas: source.magentas, whites: source.whites, neutrals: source.neutrals, blacks: source.blacks }
  }
}

export function psdAdjustmentLayer(layer: Layer, index: number): AdjustmentLayer | null {
  const source = layer.adjustment
  if (!source || !canImportPsdAdjustment(layer)) return null
  const adjustment = createAdjustmentLayer(index)
  adjustment.adjustment = psdAdjustmentDescriptor(source)
  if (source.type === 'brightness/contrast' && !source.labColorOnly) {
    adjustment.brightness = clamp(100 + (source.brightness ?? 0), 0, 200)
    adjustment.contrast = clamp(100 + (source.contrast ?? 0), 0, 200)
  } else if (source.type === 'hue/saturation') {
    adjustment.hue = clamp(source.master?.hue ?? 0, -180, 180)
    adjustment.saturation = clamp(100 + (source.master?.saturation ?? 0), 0, 200)
    adjustment.brightness = clamp(100 + (source.master?.lightness ?? 0), 0, 200)
  }

  adjustment.name = layer.name?.trim() || source.type.split(' ').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
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
      if (layer.placedLayer) add('smart-object-preview', 'Smart objects use raster previews while their placed and linked metadata remains preserved', path)
      const editableShape = canImportPsdShape(layer, psd.width, psd.height)
      if ((layer.vectorFill || layer.vectorStroke || layer.vectorOrigination) && !editableShape) add('vector', 'Complex vector shapes were rasterized', path)
      if (!layer.adjustment && !importableRasterMask(layer) && (layer.mask || layer.realMask) && !layer.vectorMask) add('mask', 'Unsupported masks were not preserved as editable masks', path)
      if (layer.adjustment && !canImportPsdAdjustment(layer)) add('adjustment', `Unsupported “${layer.adjustment.type}” adjustment was not preserved`, path)
      if (layer.adjustment?.type === 'color lookup' && !canPreviewColorLookup(layer.adjustment)) add('color-lookup-preview', 'Color Lookup data was preserved, but this LUT encoding cannot yet be previewed', path)
      if (layer.adjustment && (layer.mask || layer.realMask || layer.vectorMask)) add('adjustment-mask', 'Adjustment-layer masks were not preserved', path)
      if (hasUnsupportedAdvancedBlending(layer)) add('advanced-blending', 'Knockout blending was not preserved', path)
      if (layer.blendMode && layer.blendMode !== 'pass through' && !psdBlendModes[layer.blendMode]) {
        add(`blend:${layer.blendMode}`, `Unsupported “${layer.blendMode}” blending was changed to normal`, path)
      }
      if (layer.animationFrames?.length || layer.timeline) add('animation', 'Layer animation data was not imported', path)
      if (layer.children) visit(layer.children, path)
    })
  }

  if (psd.bitsPerChannel && psd.bitsPerChannel !== 8) add('depth', `${psd.bitsPerChannel}-bit source samples were preserved; the canvas preview uses an 8-bit display conversion`)
  if (psd.colorMode !== undefined && psd.colorMode !== 3) add('color-mode', 'The source color mode was converted to RGB')
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

export async function importPsdBuffer(buffer: ArrayBuffer, name = 'Untitled.psd'): Promise<{ document: EditorDocument; assets: AssetMap; warnings: string[] }> {
  initializeBrowserCanvas()
  let psd
  try {
    psd = readPsd(buffer, { skipThumbnail: true, useImageData: true })
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
        applyPsdLayerMetadata(editableText, layer, psd.width, psd.height)
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
        applyPsdLayerMetadata(editableShape, layer, psd.width, psd.height, false)
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
      assets[assetId] = await sourceFromCanvas(canvas, path, precisionFromImageData(layer.imageData, psd.bitsPerChannel ?? 8))
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
      applyPsdLayerMetadata(raster, layer, psd.width, psd.height)
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

  const channelNames = psd.imageResources?.alphaChannelNames ?? []
  const compositePlanes = psd.channels && psd.channels > 3
    ? decodeCompositePlanes(buffer, psd.width, psd.height, psd.channels, psd.bitsPerChannel ?? 8)
    : []
  const globalAlphaChannels = Math.max(0, (psd.channels ?? 3) - 3 - channelNames.length)
  const channels = channelNames.flatMap((channelName, index) => {
    const plane = compositePlanes[3 + globalAlphaChannels + index]
    if (!plane) return []
    const canvas = channelPlaneToCanvas(plane, psd.width, psd.height, psd.bitsPerChannel ?? 8)
    if (!canvas) return []
    const assetId = createId()
    assets[assetId] = { element: canvas as unknown as HTMLImageElement, name: `${channelName} channel`, surface: canvas, revision: 0, precision: precisionFromChannelPlane(plane, psd.width, psd.height, psd.bitsPerChannel ?? 8) }
    return [{ id: psd.imageResources?.alphaIdentifiers?.[index], name: channelName, assetId }]
  })

  const composite = layerCanvas(psd)
  if (layers.length === 0 && composite) {
    const assetId = createId()
    assets[assetId] = await sourceFromCanvas(composite, name, precisionFromImageData(psd.imageData, psd.bitsPerChannel ?? 8))
    layers.push(createRasterLayer(assetId, name.replace(/\.psb?$/i, ''), psd.width, psd.height))
  }
  if (layers.length === 0) throw new Error('The PSD did not contain any rasterizable layer data.')

  const selectedLayerId = layers.at(-1)?.id ?? null
  return {
    assets,
    warnings: psdImportWarnings(psd),
    document: {
      ...initialDocument,
      bitDepth: psd.bitsPerChannel === 16 || psd.bitsPerChannel === 32 ? psd.bitsPerChannel : 8,
      canvasPreset: 'custom',
      canvasSize: { width: psd.width, height: psd.height },
      background: { ...initialDocument.background, kind: 'transparent' },
      groups,
      layers,
      selectedLayerId,
      selectedLayerIds: selectedLayerId ? [selectedLayerId] : [],
      channels,
      guides: (psd.imageResources?.gridAndGuidesInformation?.guides ?? []).map((guide, index) => ({ id: `psd-guide-${index}`, direction: guide.direction, position: guide.location })),
      psdMetadata: {
        imageResources: preservedImageResources(psd.imageResources),
        linkedFiles: psd.linkedFiles?.map((file) => serializePsdValue(file)),
      },
    },
  }
}

export async function importPsdFile(file: File) {
  return importPsdBuffer(await file.arrayBuffer(), file.name)
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

function generatedEffects(effects: LayerEffects | null | undefined): Layer['effects'] {
  if (!effects) return undefined
  effects = normalizeLayerEffects(effects)
  const result: NonNullable<Layer['effects']> = {}
  if (effects.dropShadow.enabled) result.dropShadow = [{ enabled: true, color: psdColor(effects.dropShadow.color), opacity: effects.dropShadow.opacity / 100, angle: effects.dropShadow.angle, distance: { units: 'Pixels', value: effects.dropShadow.distance }, size: { units: 'Pixels', value: effects.dropShadow.blur }, choke: { units: 'Pixels', value: effects.dropShadow.spread }, blendMode: studioPsdBlendModes[effects.dropShadow.blendMode] }]
  if (effects.innerShadow.enabled) result.innerShadow = [{ enabled: true, color: psdColor(effects.innerShadow.color), opacity: effects.innerShadow.opacity / 100, angle: effects.innerShadow.angle, distance: { units: 'Pixels', value: effects.innerShadow.distance }, size: { units: 'Pixels', value: effects.innerShadow.blur }, choke: { units: 'Pixels', value: effects.innerShadow.choke }, blendMode: studioPsdBlendModes[effects.innerShadow.blendMode] }]
  if (effects.outerGlow.enabled) result.outerGlow = { enabled: true, color: psdColor(effects.outerGlow.color), opacity: effects.outerGlow.opacity / 100, size: { units: 'Pixels', value: effects.outerGlow.size }, choke: { units: 'Pixels', value: effects.outerGlow.spread }, blendMode: studioPsdBlendModes[effects.outerGlow.blendMode] }
  if (effects.innerGlow.enabled) result.innerGlow = { enabled: true, color: psdColor(effects.innerGlow.color), opacity: effects.innerGlow.opacity / 100, size: { units: 'Pixels', value: effects.innerGlow.size }, choke: { units: 'Pixels', value: effects.innerGlow.choke }, source: effects.innerGlow.source, blendMode: studioPsdBlendModes[effects.innerGlow.blendMode] }
  if (effects.bevel.enabled) result.bevel = { enabled: true, size: { units: 'Pixels', value: effects.bevel.size }, strength: effects.bevel.depth, angle: effects.bevel.angle, altitude: effects.bevel.altitude, highlightColor: psdColor(effects.bevel.highlightColor), highlightOpacity: effects.bevel.highlightOpacity / 100, shadowColor: psdColor(effects.bevel.shadowColor), shadowOpacity: effects.bevel.shadowOpacity / 100, style: effects.bevel.style, direction: effects.bevel.direction }
  if (effects.satin.enabled) result.satin = { enabled: true, color: psdColor(effects.satin.color), opacity: effects.satin.opacity / 100, angle: effects.satin.angle, distance: { units: 'Pixels', value: effects.satin.distance }, size: { units: 'Pixels', value: effects.satin.size }, invert: effects.satin.invert, blendMode: studioPsdBlendModes[effects.satin.blendMode] }
  if (effects.colorOverlay.enabled) result.solidFill = [{ enabled: true, color: psdColor(effects.colorOverlay.color), opacity: effects.colorOverlay.opacity / 100, blendMode: studioPsdBlendModes[effects.colorOverlay.blendMode] }]
  if (effects.gradientOverlay.enabled) result.gradientOverlay = [{
    enabled: true, opacity: effects.gradientOverlay.opacity / 100, angle: effects.gradientOverlay.angle, scale: effects.gradientOverlay.scale,
    type: effects.gradientOverlay.style, reverse: effects.gradientOverlay.reverse, blendMode: studioPsdBlendModes[effects.gradientOverlay.blendMode],
    gradient: effects.gradientOverlay.gradientType === 'noise' ? {
      type: 'noise', name: effects.gradientOverlay.name, roughness: effects.gradientOverlay.roughness, randomSeed: effects.gradientOverlay.randomSeed,
      colorModel: effects.gradientOverlay.colorModel === 'hsl' ? 'hsb' : effects.gradientOverlay.colorModel, restrictColors: effects.gradientOverlay.restrictColors,
      addTransparency: effects.gradientOverlay.addTransparency, min: effects.gradientOverlay.min, max: effects.gradientOverlay.max,
    } : {
      type: 'solid', name: effects.gradientOverlay.name,
      colorStops: effects.gradientOverlay.colorStops.map((stop) => ({ color: psdColor(stop.color), location: Math.round(stop.position * 4096), midpoint: 50 })),
      opacityStops: effects.gradientOverlay.opacityStops.map((stop) => ({ opacity: stop.opacity, location: Math.round(stop.position * 4096), midpoint: 50 })),
    },
  }]
  if (effects.patternOverlay.enabled) result.patternOverlay = { enabled: true, opacity: effects.patternOverlay.opacity / 100, scale: effects.patternOverlay.scale, blendMode: studioPsdBlendModes[effects.patternOverlay.blendMode], pattern: { id: effects.patternOverlay.id, name: effects.patternOverlay.name }, phase: effects.patternOverlay.phase, align: effects.patternOverlay.linked }
  if (effects.stroke.enabled) result.stroke = [{
    enabled: true, fillType: effects.stroke.fillType, color: effects.stroke.fillType === 'color' ? psdColor(effects.stroke.color) : undefined,
    gradient: effects.stroke.fillType === 'gradient' ? (effects.stroke.gradient.gradientType === 'noise' ? {
      type: 'noise', name: effects.stroke.gradient.name, roughness: effects.stroke.gradient.roughness, randomSeed: effects.stroke.gradient.randomSeed,
      colorModel: effects.stroke.gradient.colorModel === 'hsl' ? 'hsb' : effects.stroke.gradient.colorModel, restrictColors: effects.stroke.gradient.restrictColors,
      addTransparency: effects.stroke.gradient.addTransparency, min: effects.stroke.gradient.min, max: effects.stroke.gradient.max,
      style: effects.stroke.gradient.style, angle: effects.stroke.gradient.angle, scale: effects.stroke.gradient.scale, reverse: effects.stroke.gradient.reverse,
    } : {
      type: 'solid', name: effects.stroke.gradient.name,
      colorStops: effects.stroke.gradient.colorStops.map((stop) => ({ color: psdColor(stop.color), location: Math.round(stop.position * 4096), midpoint: 50 })),
      opacityStops: effects.stroke.gradient.opacityStops.map((stop) => ({ opacity: stop.opacity, location: Math.round(stop.position * 4096), midpoint: 50 })),
      style: effects.stroke.gradient.style, angle: effects.stroke.gradient.angle, scale: effects.stroke.gradient.scale, reverse: effects.stroke.gradient.reverse,
    }) : undefined,
    pattern: effects.stroke.fillType === 'pattern' ? { id: effects.stroke.pattern.id, name: effects.stroke.pattern.name } : undefined,
    opacity: effects.stroke.opacity / 100, size: { units: 'Pixels', value: effects.stroke.size }, position: effects.stroke.position, blendMode: studioPsdBlendModes[effects.stroke.blendMode],
  }]
  return Object.keys(result).length ? result : undefined
}

function exportedEffects(effects: LayerEffects | null | undefined, metadata?: SerializedPsdValue, additionalEffects: LayerEffects[] = []): Layer['effects'] {
  const original = metadata ? revivePsdValue(metadata) as NonNullable<Layer['effects']> : {}
  const primary = generatedEffects(effects) ?? {}
  const additional = additionalEffects.map((value) => generatedEffects(value) ?? {})
  const result: NonNullable<Layer['effects']> = { ...original }
  const arrayKeys = ['dropShadow', 'innerShadow', 'solidFill', 'gradientOverlay', 'stroke'] as const
  for (const key of arrayKeys) {
    const primaryValues = (primary[key] ?? []) as Array<Record<string, unknown>>
    const generated = [...primaryValues, ...additional.flatMap((entry) => (entry[key] ?? []) as Array<Record<string, unknown>>)]
    const originals = (original[key] ?? []) as Array<Record<string, unknown>>
    const merged = generated.map((value, index) => ({ ...originals[index], ...value }))
    if (merged.length) result[key] = merged as never
    else delete result[key]
  }
  const singletonKeys = ['outerGlow', 'innerGlow', 'bevel', 'satin', 'patternOverlay'] as const
  for (const key of singletonKeys) {
    if (primary[key]) result[key] = { ...(original[key] as Record<string, unknown> | undefined), ...(primary[key] as Record<string, unknown>) } as never
    else delete result[key]
  }
  return Object.keys(result).length ? result : undefined
}

function exportedMask(layer: EditorLayer, assets: AssetMap, width: number, height: number): Layer['mask'] {
  const assetId = layer.maskAssetId
  const source = assetId ? assets[assetId] : undefined
  if (!source && !layer.vectorMask) return undefined
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  if (source) canvas.getContext('2d')?.drawImage(source.surface ?? source.element, 0, 0, width, height)
  const imageData = source ? canvasPixels(canvas) : undefined
  return {
    left: 0, top: 0, right: source ? width : 0, bottom: source ? height : 0, defaultColor: 255, imageData,
    userMaskDensity: source ? (layer.maskSettings?.density ?? 100) / 100 : undefined,
    userMaskFeather: source ? layer.maskSettings?.feather ?? 0 : undefined,
    positionRelativeToLayer: source ? layer.maskSettings?.linked ?? true : undefined,
    vectorMaskDensity: layer.vectorMask ? layer.vectorMask.density / 100 : undefined,
    vectorMaskFeather: layer.vectorMask?.feather,
    fromVectorData: !source && Boolean(layer.vectorMask),
  }
}

function exportedVectorMask(layer: EditorLayer, width: number, height: number): Layer['vectorMask'] {
  const vector = layer.vectorMask
  if (!vector) return undefined
  return {
    invert: vector.inverted,
    disable: vector.disabled,
    notLink: !vector.linked,
    fillStartsWithAllPixels: vector.fillStartsWithAllPixels,
    paths: vector.paths.map((path) => ({
      open: !path.closed,
      operation: path.operation,
      fillRule: path.fillRule,
      knots: path.knots.map((knot) => {
        const point = (position: Position) => [position.x * width, position.y * height]
        return { linked: knot.linked, points: [...point(knot.in), ...point(knot.anchor), ...point(knot.out)] }
      }),
    })),
  }
}

function exportedBlendingRanges(layer: EditorLayer): Layer['blendingRanges'] {
  if (!layer.blendIf) return undefined
  return {
    compositeGrayBlendSource: [...layer.blendIf.source],
    compositeGraphBlendDestinationRange: [...layer.blendIf.destination],
    ranges: layer.blendIf.channels.map((channel) => ({ sourceRange: [...channel.source], destRange: [...channel.destination] })),
  }
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

function exportedShape(layer: ShapeLayer, bounds: ReturnType<typeof getLayerBounds>): Pick<Layer, 'vectorFill' | 'vectorOrigination' | 'vectorStroke' | 'vectorMask'> {
  if (!bounds) return {}
  const vectorFill: Layer['vectorFill'] = layer.fillStyle?.type === 'gradient'
    ? {
        type: 'solid', name: layer.fillStyle.name, style: layer.fillStyle.style, angle: layer.fillStyle.angle, scale: layer.fillStyle.scale,
        colorStops: layer.fillStyle.colorStops.map((stop) => ({ color: psdColor(stop.color), location: Math.round(stop.position * 4096), midpoint: 50 })),
        opacityStops: layer.fillStyle.opacityStops.map((stop) => ({ opacity: stop.opacity, location: Math.round(stop.position * 4096), midpoint: 50 })),
      }
    : layer.fillStyle?.type === 'pattern'
      ? { type: 'pattern', id: layer.fillStyle.id, name: layer.fillStyle.name, linked: layer.fillStyle.linked, phase: layer.fillStyle.phase }
      : { type: 'color', color: psdColor(layer.fillStyle?.type === 'color' ? layer.fillStyle.color : layer.fill) }
  return {
    vectorFill,
    vectorOrigination: { keyDescriptorList: [{
      keyOriginShapeBoundingBox: { left: { units: 'Pixels', value: bounds.x }, top: { units: 'Pixels', value: bounds.y }, right: { units: 'Pixels', value: bounds.x + bounds.width }, bottom: { units: 'Pixels', value: bounds.y + bounds.height } },
      keyOriginRRectRadii: { topLeft: { units: 'Pixels', value: layer.cornerRadius }, topRight: { units: 'Pixels', value: layer.cornerRadius }, bottomLeft: { units: 'Pixels', value: layer.cornerRadius }, bottomRight: { units: 'Pixels', value: layer.cornerRadius } },
    }] },
    vectorStroke: layer.strokeWidth > 0 ? {
      strokeEnabled: true, fillEnabled: true, lineWidth: { units: 'Pixels', value: layer.strokeWidth },
      lineAlignment: layer.strokeStyle?.alignment ?? 'center', lineCapType: layer.strokeStyle?.cap ?? 'butt', lineJoinType: layer.strokeStyle?.join ?? 'miter',
      miterLimit: layer.strokeStyle?.miterLimit ?? 10, lineDashOffset: { units: 'Pixels', value: layer.strokeStyle?.dashOffset ?? 0 },
      lineDashSet: layer.strokeStyle?.dashes.map((value) => ({ units: 'Pixels' as const, value })) ?? [],
      blendMode: studioPsdBlendModes[layer.strokeStyle?.blendMode ?? 'normal'], content: { type: 'color', color: psdColor(layer.stroke) }, opacity: layer.strokeStyle?.opacity ?? 1,
    } : undefined,
    vectorMask: layer.vectorPaths?.length ? {
      paths: layer.vectorPaths.map((path) => ({
        open: !path.closed, operation: path.operation, fillRule: path.fillRule,
        knots: path.knots.map((knot) => {
          const point = (position: Position) => [bounds.x + position.x * bounds.width, bounds.y + position.y * bounds.height]
          return { linked: knot.linked, points: [...point(knot.in), ...point(knot.anchor), ...point(knot.out)] }
        }),
      })),
    } : undefined,
  }
}

function exportedAdjustment(layer: AdjustmentLayer): Layer['adjustment'] {
  const source = layer.adjustment
  if (source) {
    switch (source.type) {
      case 'brightness/contrast': return { ...source }
      case 'levels': return { ...source }
      case 'curves': return { ...source }
      case 'exposure': return { ...source }
      case 'vibrance': return { ...source }
      case 'hue/saturation': {
        const channel = (value: typeof source.master) => value ? { a: value.range[0], b: value.range[1], c: value.range[2], d: value.range[3], hue: value.hue, saturation: value.saturation, lightness: value.lightness } : undefined
        return { ...source, master: channel(source.master), reds: channel(source.reds), yellows: channel(source.yellows), greens: channel(source.greens), cyans: channel(source.cyans), blues: channel(source.blues), magentas: channel(source.magentas) }
      }
      case 'color balance': return { ...source }
      case 'black & white': return { ...source, tintColor: psdColor(source.tintColor) }
      case 'photo filter': return { ...source, color: psdColor(source.color) }
      case 'channel mixer': return { ...source }
      case 'color lookup': return { ...source, profile: source.profile ? Uint8Array.from(source.profile) : undefined, lut3DFileData: source.lut3DFileData ? Uint8Array.from(source.lut3DFileData) : undefined }
      case 'invert': return { ...source }
      case 'posterize': return { ...source }
      case 'threshold': return { ...source }
      case 'gradient map': return { ...source, colorStops: source.colorStops?.map((stop) => ({ color: psdColor(stop.color), location: Math.round(stop.position * 4096), midpoint: stop.midpoint })), opacityStops: source.opacityStops?.map((stop) => ({ opacity: stop.opacity, location: Math.round(stop.position * 4096), midpoint: stop.midpoint })) }
      case 'selective color': return { ...source }
    }
  }
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
  const bitDepth = documentState.bitDepth === 16 || documentState.bitDepth === 32 ? documentState.bitDepth : 8

  const exportLayer = (layer: EditorLayer): Layer => {
    const base: Layer = {
      name: layer.name, hidden: !layer.visible, opacity: layer.opacity / 100,
      blendMode: studioPsdBlendModes[layer.blendMode ?? 'normal'], clipping: Boolean(layer.clipToBelow),
      protected: layer.locked ? { position: true, composite: true } : undefined,
      mask: exportedMask(layer, assets, width, height), vectorMask: exportedVectorMask(layer, width, height),
      blendingRanges: exportedBlendingRanges(layer), effects: exportedEffects(layer.effects, layer.psdEffectsMetadata, layer.additionalEffects), id: layer.psdLayerId,
      placedLayer: layer.psdPlacedLayer ? revivePsdValue(layer.psdPlacedLayer) as PlacedLayer : undefined,
    }
    if (layer.type === 'adjustment') {
      if (bitDepth !== 8) base.rawData = rawLayerData(bitDepth, psb, undefined, undefined, base.mask)
      return { ...base, adjustment: exportedAdjustment(layer) }
    }
    const rendered = renderCanvas([{ ...layer, opacity: 100, blendMode: 'normal', clipToBelow: false, maskAssetId: null, effects: null, additionalEffects: [], groupId: null, stackOrder: 0 }])
    const bounds = getLayerBounds(geometryContext, geometryCanvas, layer, assets)
    const rasterLayer = layer.type === 'raster' ? layer : undefined
    const rasterAsset = rasterLayer ? assets[rasterLayer.assetId] : undefined
    const exactPrecision = rasterAsset?.precision
    const normalizedFilters = normalizeLayerFilters(rasterLayer?.filters)
    const useExactPrecision = rasterLayer && exactPrecision
      && exactPrecision.bitDepth === bitDepth
      && exactPrecision.revision === (rasterAsset?.revision ?? 0)
      && exactPrecision.width === rasterLayer.width
      && exactPrecision.height === rasterLayer.height
      && rasterLayer.scale === 100
      && rasterLayer.rotation === 0
      && !rasterLayer.flipX
      && !rasterLayer.flipY
      && Object.entries(defaultLayerFilters).every(([key, value]) => normalizedFilters[key as keyof typeof normalizedFilters] === value)
      && bounds
    if (bitDepth !== 8) {
      if (useExactPrecision) {
        Object.assign(base, { left: Math.round(bounds.x), top: Math.round(bounds.y), right: Math.round(bounds.x + bounds.width), bottom: Math.round(bounds.y + bounds.height), rawData: rawLayerData(bitDepth, psb, undefined, exactPrecision, base.mask) })
      } else {
        Object.assign(base, { left: 0, top: 0, right: width, bottom: height, rawData: rawLayerData(bitDepth, psb, canvasPixels(rendered), undefined, base.mask) })
      }
    } else Object.assign(base, { left: 0, top: 0, right: width, bottom: height, imageData: canvasPixels(rendered) })
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
    const backgroundPixels = canvasPixels(backgroundCanvas)
    children.push(bitDepth === 8
      ? { name: 'Studio Background', left: 0, top: 0, right: width, bottom: height, imageData: backgroundPixels }
      : { name: 'Studio Background', left: 0, top: 0, right: width, bottom: height, rawData: rawLayerData(bitDepth, psb, backgroundPixels) })
  }
  resources.dispose()
  const channelNames = documentState.channels?.map((channel) => channel.name)
  const channelIds = documentState.channels?.flatMap((channel) => channel.id === undefined ? [] : [channel.id])
  const preservedResources = documentState.psdMetadata?.imageResources
    ? revivePsdValue(documentState.psdMetadata.imageResources) as ImageResources
    : {}
  const guides = documentState.guides?.map((guide) => ({ direction: guide.direction, location: guide.position }))
  const imageResources: ImageResources | undefined = Object.keys(preservedResources).length || channelNames?.length || guides?.length ? {
    ...preservedResources,
    alphaChannelNames: channelNames?.length ? channelNames : preservedResources.alphaChannelNames,
    alphaIdentifiers: channelIds?.length === channelNames?.length ? channelIds : preservedResources.alphaIdentifiers,
    gridAndGuidesInformation: guides?.length ? { ...preservedResources.gridAndGuidesInformation, guides } : preservedResources.gridAndGuidesInformation,
  } : undefined
  const linkedFiles = documentState.psdMetadata?.linkedFiles?.map((file) => revivePsdValue(file) as LinkedFile)
  let buffer = writePsd({ width, height, colorMode: 3, bitsPerChannel: 8, imageData, children, imageResources, linkedFiles }, { psb, noBackground: true })
  const channelSources = (documentState.channels ?? []).flatMap((channel) => {
    const source = channel.assetId ? assets[channel.assetId] : undefined
    return source?.surface ? [source] : []
  })
  buffer = replaceCompositeChannels(buffer, width, height, imageData, channelSources, bitDepth)
  return new Blob([buffer], { type: 'image/vnd.adobe.photoshop' })
}
