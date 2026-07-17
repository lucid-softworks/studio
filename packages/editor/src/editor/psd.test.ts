import { describe, expect, it } from 'vitest'
import { createCanvas, ImageData } from '@napi-rs/canvas'
import { LayerCompCapturedInfo, readPsd, writePsd, type Layer, type Psd } from 'ag-psd'
import { createLayerGroup, createShapeLayer, createTextLayer, initialDocument } from './presets'
import { exportPsdDocument, importPsdBuffer, psdAdjustmentLayer, psdBlendIf, psdBlendMode, psdImportWarnings, psdLayerEffects, psdLayerNamesInEditorOrder, psdMaskSettings, psdShapeLayer, psdSmartFilterSettings, psdSmartObjectSource, psdTextLayer, psdVectorMask } from './psd'
import { iccLookupProfile } from './fixtures/icc-fixtures'

Object.assign(globalThis, {
  ImageData,
  document: { createElement: () => createCanvas(1, 1) },
})

function highDepthComposite(bitDepth: 16 | 32, samples: [number, number, number], psb = false) {
  const sampleBytes = bitDepth / 8
  const layerLengthBytes = psb ? 8 : 4
  const buffer = new ArrayBuffer(26 + 4 + 4 + layerLengthBytes + 2 + sampleBytes * 3)
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  bytes.set(new TextEncoder().encode('8BPS'), 0)
  view.setUint16(4, psb ? 2 : 1)
  view.setUint16(12, 3)
  view.setUint32(14, 1)
  view.setUint32(18, 1)
  view.setUint16(22, bitDepth)
  view.setUint16(24, 3)
  let offset = 26
  view.setUint32(offset, 0); offset += 4
  view.setUint32(offset, 0); offset += 4
  if (psb) { view.setBigUint64(offset, 0n); offset += 8 } else { view.setUint32(offset, 0); offset += 4 }
  view.setUint16(offset, 0); offset += 2
  for (const sample of samples) {
    if (bitDepth === 16) view.setUint16(offset, sample)
    else view.setFloat32(offset, sample)
    offset += sampleBytes
  }
  return buffer
}

describe('PSD layer ordering', () => {
  it('writes layered PSD files with groups, vector metadata, and composite pixels', async () => {
    const group = { ...createLayerGroup(0), id: 'group', name: 'Artwork' }
    const shape = { ...createShapeLayer('rectangle', 0), id: 'shape', name: 'Label', groupId: group.id, fill: '#7850f0', cornerRadius: 12 }
    const blob = await exportPsdDocument({
      ...initialDocument,
      canvasPreset: 'custom',
      canvasSize: { width: 120, height: 80 },
      groups: [group],
      layers: [shape],
    }, {})
    const decoded = readPsd(await blob.arrayBuffer(), { useImageData: true, skipThumbnail: true })

    expect(psdLayerNamesInEditorOrder(decoded.children ?? [])).toEqual(['Artwork / Label'])
    expect(decoded.children?.[0]?.children?.[0]).toMatchObject({ name: 'Label', vectorFill: { type: 'color', color: { r: 120, g: 80, b: 240 } } })
    expect(decoded.imageData?.data.some((channel) => channel !== 0)).toBe(true)
  })

  it('converts ag-psd top-to-bottom children to the editor bottom-to-top stack', () => {
    const children: Layer[] = [
      { name: 'Top' },
      { name: 'Folder', children: [{ name: 'Folder top' }, { name: 'Folder bottom' }] },
      { name: 'Bottom' },
    ]

    expect(psdLayerNamesInEditorOrder(children)).toEqual([
      'Bottom',
      'Folder / Folder bottom',
      'Folder / Folder top',
      'Top',
    ])
  })

  it('keeps bottom-to-top children in compositor order for nonstandard PSD writers', () => {
    const children: Layer[] = [{ name: 'Background' }, { name: 'Artwork' }]
    expect(psdLayerNamesInEditorOrder(children, '', false)).toEqual(['Background', 'Artwork'])
  })

  it('preserves folder IDs, effects, and Blend If settings across Studio round trips', async () => {
    const imageData = new ImageData(4, 4)
    imageData.data.fill(255)
    const source: Psd = {
      width: 4,
      height: 4,
      imageData,
      children: [{
        id: 902,
        name: 'Styled folder',
        blendMode: 'pass through',
        effects: {
          dropShadow: [{ enabled: true, color: { r: 20, g: 30, b: 40 }, opacity: 0.45, distance: { units: 'Pixels', value: 3 }, size: { units: 'Pixels', value: 5 } }],
        },
        blendingRanges: {
          compositeGrayBlendSource: [12, 24, 220, 244],
          compositeGraphBlendDestinationRange: [4, 18, 232, 250],
          ranges: [{ sourceRange: [8, 20, 210, 240], destRange: [2, 14, 230, 248] }],
        },
        children: [{ name: 'Pixels', left: 0, top: 0, right: 4, bottom: 4, imageData }],
      }],
    }

    const imported = await importPsdBuffer(writePsd(source, { noBackground: true }), 'styled-folder.psd')
    expect(imported.document.groups[0]).toMatchObject({
      name: 'Styled folder',
      passThrough: true,
      psdLayerId: 902,
      effects: { dropShadow: { enabled: true, color: '#141e28', opacity: 45, distance: 3, blur: 5 } },
      blendIf: { source: [12, 24, 220, 244], destination: [4, 18, 232, 250], channels: [{ source: [8, 20, 210, 240], destination: [2, 14, 230, 248] }] },
    })

    const exported = await exportPsdDocument(imported.document, imported.assets)
    const folder = readPsd(await exported.arrayBuffer(), { useImageData: true, skipThumbnail: true }).children?.[0]
    expect(folder).toMatchObject({
      id: 902,
      name: 'Styled folder',
      blendMode: 'pass through',
      effects: { dropShadow: [{ enabled: true, opacity: 0.45, distance: { value: 3 }, size: { value: 5 } }] },
      blendingRanges: {
        compositeGrayBlendSource: [12, 24, 220, 244],
        compositeGraphBlendDestinationRange: [4, 18, 232, 250],
        ranges: [{ sourceRange: [8, 20, 210, 240], destRange: [2, 14, 230, 248] }],
      },
    })
  })

  it('maps Photoshop blend-mode names onto editor blend modes', () => {
    expect(psdBlendMode('color burn')).toBe('color-burn')
    expect(psdBlendMode('hard light')).toBe('hard-light')
    expect(psdBlendMode('linear light')).toBe('normal')
  })

  it('reports exact compatibility changes with layer paths', () => {
    const psd: Psd = {
      width: 100,
      height: 100,
      bitsPerChannel: 16,
      colorMode: 4,
      children: [{
        name: 'Artwork',
        children: [
          { name: 'Heading', text: {} as NonNullable<Layer['text']> },
          { name: 'Blend', blendMode: 'linear light' },
        ],
      }],
      imageResources: { gridAndGuidesInformation: { guides: [{ location: 40, direction: 'vertical' }] } },
    }

    expect(psdImportWarnings(psd)).toEqual(expect.arrayContaining([
      '16-bit source samples were preserved; the canvas preview uses an 8-bit display conversion',
      'The source color mode was converted to RGB',
      'Complex text was rasterized: Artwork / Heading',
      'Unsupported “linear light” blending was changed to normal: Artwork / Blend',
    ]))
  })

  it.each([
    { bitDepth: 16 as const, psb: false, samples: [0x1234, 0x8000, 0xffff] as [number, number, number], preview: [18, 128, 255], precision: [0x1234, 0x8000, 0xffff, 0xffff] },
    { bitDepth: 32 as const, psb: true, samples: [0.25, 0.5, 1] as [number, number, number], preview: [136, 186, 255], precision: [0.25, 0.5, 1, 1] },
  ])('preserves $bitDepth-bit samples while creating an 8-bit PSD/PSB preview', async ({ bitDepth, psb, samples, preview, precision }) => {
    const imported = await importPsdBuffer(highDepthComposite(bitDepth, samples, psb), psb ? 'precision.psb' : 'precision.psd')
    const raster = imported.document.layers[0]
    expect(imported.document.bitDepth).toBe(bitDepth)
    expect(raster.type).toBe('raster')
    if (raster.type !== 'raster') return
    const asset = imported.assets[raster.assetId]
    expect(asset.precision?.bitDepth).toBe(bitDepth)
    expect(Array.from(asset.precision?.data ?? [])).toEqual(precision)
    expect(Array.from(asset.surface!.getContext('2d')!.getImageData(0, 0, 1, 1).data).slice(0, 3)).toEqual(preview)

    const exported = await exportPsdDocument(imported.document, imported.assets, psb)
    const decoded = readPsd(await exported.arrayBuffer(), { useImageData: true, skipThumbnail: true })
    expect(decoded.bitsPerChannel).toBe(bitDepth)
    expect(decoded.children?.[0]?.imageData?.data).toBeInstanceOf(bitDepth === 16 ? Uint16Array : Float32Array)
    expect(Array.from(decoded.children?.[0]?.imageData?.data ?? [])).toEqual(precision)
    const reopened = await importPsdBuffer(await exported.arrayBuffer(), psb ? 'roundtrip.psb' : 'roundtrip.psd')
    expect(reopened.document.bitDepth).toBe(bitDepth)
  })

  it('maps common Photoshop effects onto editable Studio effects', () => {
    expect(psdLayerEffects({
      effects: {
        dropShadow: [{ enabled: true, color: { r: 10, g: 20, b: 30 }, opacity: 0.5, angle: 45, distance: { units: 'Pixels', value: 12 }, size: { units: 'Pixels', value: 8 } }],
        outerGlow: { enabled: true, color: { r: 200, g: 100, b: 50 }, opacity: 0.25, size: { units: 'Pixels', value: 16 } },
      },
    })).toMatchObject({
      dropShadow: { enabled: true, color: '#0a141e', opacity: 50, angle: 45, distance: 12, blur: 8 },
      outerGlow: { enabled: true, color: '#c86432', opacity: 25, size: 16 },
    })
  })

  it('preserves the primary Photoshop layer-style families as editable effects', async () => {
    const source: Layer = {
      effects: {
        innerShadow: [{ enabled: true, color: { r: 20, g: 30, b: 40 }, opacity: 0.4, angle: 35, distance: { units: 'Pixels', value: 7 }, size: { units: 'Pixels', value: 11 }, choke: { units: 'Pixels', value: 2 }, blendMode: 'multiply' }],
        innerGlow: { enabled: true, color: { r: 240, g: 220, b: 80 }, opacity: 0.6, size: { units: 'Pixels', value: 9 }, source: 'center', blendMode: 'screen' },
        bevel: { enabled: true, size: { units: 'Pixels', value: 5 }, strength: 180, angle: 125, altitude: 35, highlightColor: { r: 255, g: 255, b: 255 }, highlightOpacity: 0.8, shadowColor: { r: 10, g: 10, b: 20 }, shadowOpacity: 0.65, style: 'inner bevel', direction: 'up' },
        satin: { enabled: true, color: { r: 50, g: 20, b: 80 }, opacity: 0.45, angle: 25, distance: { units: 'Pixels', value: 8 }, size: { units: 'Pixels', value: 14 }, invert: true, blendMode: 'multiply' },
        gradientOverlay: [{
          enabled: true, opacity: 0.9, angle: 42, scale: 130, type: 'linear', reverse: true, blendMode: 'overlay',
          gradient: { type: 'solid', name: 'Violet', colorStops: [{ color: { r: 255, g: 20, b: 80 }, location: 0, midpoint: 50 }, { color: { r: 80, g: 20, b: 255 }, location: 4096, midpoint: 50 }], opacityStops: [{ opacity: 1, location: 0, midpoint: 50 }, { opacity: 0.5, location: 4096, midpoint: 50 }] },
        }],
        patternOverlay: { enabled: true, opacity: 0.55, scale: 75, blendMode: 'soft light', pattern: { id: 'pattern-1', name: 'Paper' }, phase: { x: 4, y: 6 }, align: false },
        stroke: [{ enabled: true, fillType: 'color', color: { r: 5, g: 200, b: 240 }, opacity: 0.75, size: { units: 'Pixels', value: 6 }, position: 'inside', blendMode: 'normal' }],
      },
    }
    const imported = psdLayerEffects(source)
    expect(imported).toMatchObject({
      innerShadow: { enabled: true, color: '#141e28', opacity: 40, distance: 7, blur: 11, choke: 2, blendMode: 'multiply' },
      innerGlow: { enabled: true, color: '#f0dc50', opacity: 60, size: 9, source: 'center', blendMode: 'screen' },
      bevel: { enabled: true, size: 5, depth: 180, angle: 125, altitude: 35, highlightOpacity: 80, shadowOpacity: 65 },
      satin: { enabled: true, color: '#321450', opacity: 45, distance: 8, size: 14, invert: true },
      gradientOverlay: { enabled: true, opacity: 90, angle: 42, scale: 130, reverse: true, blendMode: 'overlay', name: 'Violet', colorStops: [{ color: '#ff1450', position: 0 }, { color: '#5014ff', position: 1 }] },
      patternOverlay: { enabled: true, opacity: 55, scale: 75, blendMode: 'soft-light', id: 'pattern-1', name: 'Paper', phase: { x: 4, y: 6 }, linked: false },
      stroke: { enabled: true, color: '#05c8f0', opacity: 75, size: 6, position: 'inside' },
    })
    expect(psdImportWarnings({ width: 100, height: 100, children: [source] })).not.toContain(expect.stringContaining('effects'))

    const shape = { ...createShapeLayer('ellipse', 0), effects: imported }
    const blob = await exportPsdDocument({ ...initialDocument, canvasPreset: 'custom', canvasSize: { width: 100, height: 100 }, layers: [shape] }, {})
    const effects = readPsd(await blob.arrayBuffer(), { useImageData: true, skipThumbnail: true }).children?.[0]?.effects
    expect(effects).toMatchObject({
      innerShadow: [{ enabled: true, distance: { value: 7 } }], innerGlow: { enabled: true, source: 'center' },
      bevel: { enabled: true, strength: 180 }, satin: { enabled: true, invert: true },
      gradientOverlay: [{ enabled: true, gradient: { type: 'solid', name: 'Violet' } }],
      patternOverlay: { enabled: true, pattern: { id: 'pattern-1', name: 'Paper' } },
      stroke: [{ enabled: true, fillType: 'color', position: 'inside' }],
    })
  })

  it('round-trips editable gradient and pattern effect strokes', async () => {
    const gradient = psdLayerEffects({ effects: { stroke: [{
      enabled: true, fillType: 'gradient', opacity: 0.8, size: { units: 'Pixels', value: 9 }, position: 'outside', blendMode: 'overlay',
      gradient: { type: 'solid', name: 'Sunset', style: 'linear', angle: 35, scale: 120, reverse: true, colorStops: [{ color: { r: 255, g: 40, b: 20 }, location: 0, midpoint: 50 }, { color: { r: 30, g: 20, b: 255 }, location: 4096, midpoint: 50 }], opacityStops: [{ opacity: 1, location: 0, midpoint: 50 }, { opacity: 1, location: 4096, midpoint: 50 }] },
    }] } })!
    const pattern = psdLayerEffects({ effects: { stroke: [{ enabled: true, fillType: 'pattern', opacity: 0.6, size: { units: 'Pixels', value: 5 }, position: 'inside', pattern: { id: 'paper-1', name: 'Paper' } }] } })!
    expect(gradient.stroke).toMatchObject({ fillType: 'gradient', gradient: { name: 'Sunset', angle: 35, scale: 120, reverse: true } })
    expect(gradient.stroke.gradient.colorStops[0]).toMatchObject({ color: '#ff2814' })
    expect(pattern.stroke).toMatchObject({ fillType: 'pattern', pattern: { id: 'paper-1', name: 'Paper' } })

    const shape = { ...createShapeLayer('rectangle', 0), effects: gradient, additionalEffects: [pattern] }
    const blob = await exportPsdDocument({ ...initialDocument, canvasPreset: 'custom', canvasSize: { width: 64, height: 64 }, layers: [shape] }, {})
    const decoded = readPsd(await blob.arrayBuffer(), { useImageData: true, skipThumbnail: true })
    expect(decoded.children?.[0]?.effects?.stroke).toMatchObject([
      { fillType: 'gradient', gradient: { name: 'Sunset', angle: 35, scale: 120, reverse: true } },
      { fillType: 'pattern', pattern: { id: 'paper-1', name: 'Paper' } },
    ])
  })

  it('round-trips seeded noise-gradient layer styles', async () => {
    const imported = psdLayerEffects({ effects: { gradientOverlay: [{
      enabled: true,
      angle: 18,
      gradient: { type: 'noise', name: 'Chromatic noise', roughness: 72, randomSeed: 12345, colorModel: 'rgb', restrictColors: true, addTransparency: true, min: [0.1, 0.2, 0.3, 0], max: [0.9, 0.8, 0.7, 1] },
    }] } })
    expect(imported?.gradientOverlay).toMatchObject({ enabled: true, gradientType: 'noise', name: 'Chromatic noise', roughness: 72, randomSeed: 12345, restrictColors: true, addTransparency: true, min: [0.1, 0.2, 0.3, 0], max: [0.9, 0.8, 0.7, 1] })
    const shape = { ...createShapeLayer('rectangle', 0), effects: imported }
    const blob = await exportPsdDocument({ ...initialDocument, canvasPreset: 'custom', canvasSize: { width: 32, height: 32 }, layers: [shape] }, {})
    expect(readPsd(await blob.arrayBuffer(), { useImageData: true, skipThumbnail: true }).children?.[0]?.effects?.gradientOverlay?.[0]?.gradient)
      .toMatchObject({ type: 'noise', name: 'Chromatic noise', roughness: 72, randomSeed: 12345, min: [0.1, 0.2, 0.3, 0], max: [0.9, 0.8, 0.7, 1] })
  })

  it('renders and round-trips multiple style instances without losing custom contours', async () => {
    const imageData = new ImageData(8, 8)
    imageData.data.fill(255)
    const contour = { name: 'Custom S', curve: [{ x: 0, y: 0 }, { x: 128, y: 210 }, { x: 255, y: 255 }] }
    const source: Psd = {
      width: 8, height: 8, imageData,
      children: [{ name: 'Styled', left: 0, top: 0, right: 8, bottom: 8, imageData, effects: { dropShadow: [
        { enabled: true, color: { r: 0, g: 0, b: 0 }, opacity: 0.5, distance: { units: 'Pixels', value: 2 }, size: { units: 'Pixels', value: 3 }, contour },
        { enabled: true, color: { r: 80, g: 20, b: 180 }, opacity: 0.35, distance: { units: 'Pixels', value: 5 }, size: { units: 'Pixels', value: 7 }, contour: { ...contour, name: 'Second' } },
      ] } }],
    }
    const imported = await importPsdBuffer(writePsd(source, { noBackground: true }), 'styles.psd')
    expect(imported.document.layers[0].additionalEffects).toHaveLength(1)
    expect(psdImportWarnings(source)).not.toContain(expect.stringContaining('effects'))
    const blob = await exportPsdDocument(imported.document, imported.assets)
    const shadows = readPsd(await blob.arrayBuffer(), { useImageData: true, skipThumbnail: true }).children?.[0]?.effects?.dropShadow
    expect(shadows).toHaveLength(2)
    expect(shadows?.[0]).toMatchObject({ distance: { value: 2 }, contour: { name: 'Custom S', curve: [{ x: 0, y: 0 }, { x: 128, y: 210 }, { x: 255, y: 255 }] } })
    expect(shadows?.[1]).toMatchObject({ distance: { value: 5 }, contour: { name: 'Second' } })
  })

  it('preserves basic vector rectangles and ellipses as editable shapes', () => {
    const rectangle: Layer = {
      name: 'Label',
      vectorFill: { type: 'color', color: { r: 120, g: 80, b: 240 } },
      vectorOrigination: { keyDescriptorList: [{
        keyOriginShapeBoundingBox: {
          left: { units: 'Pixels', value: 40 }, top: { units: 'Pixels', value: 20 },
          right: { units: 'Pixels', value: 240 }, bottom: { units: 'Pixels', value: 100 },
        },
        keyOriginRRectRadii: {
          topLeft: { units: 'Pixels', value: 12 }, topRight: { units: 'Pixels', value: 12 },
          bottomLeft: { units: 'Pixels', value: 12 }, bottomRight: { units: 'Pixels', value: 12 },
        },
      }] },
    }
    const ellipse: Layer = {
      name: 'Ellipse',
      vectorFill: { type: 'color', color: { r: 20, g: 180, b: 120 } },
      vectorOrigination: { keyDescriptorList: [{ keyOriginShapeBoundingBox: {
        left: { units: 'Pixels', value: 100 }, top: { units: 'Pixels', value: 50 },
        right: { units: 'Pixels', value: 300 }, bottom: { units: 'Pixels', value: 150 },
      } }] },
      vectorMask: { paths: [{ open: false, fillRule: 'non-zero', knots: [
        { linked: true, points: [100, 80, 100, 100, 100, 120] },
        { linked: true, points: [160, 150, 200, 150, 240, 150] },
        { linked: true, points: [300, 120, 300, 100, 300, 80] },
        { linked: true, points: [240, 50, 200, 50, 160, 50] },
      ] }] },
    }

    expect(psdShapeLayer(rectangle, 400, 200)).toMatchObject({ shape: 'rectangle', fill: '#7850f0', width: 50, height: 40, cornerRadius: 12 })
    expect(psdShapeLayer(ellipse, 400, 200)).toMatchObject({ shape: 'ellipse', fill: '#14b478', width: 50, height: 50 })
    expect(psdImportWarnings({ width: 400, height: 200, children: [rectangle, ellipse] }))
      .not.toEqual(expect.arrayContaining([expect.stringMatching(/vector|mask/i)]))
  })

  it('preserves compound paths, gradient fills, and complete stroke metadata', async () => {
    const square = (left: number, top: number, right: number, bottom: number) => ({ open: false, fillRule: 'even-odd' as const, knots: [
      { linked: false, points: [left, top, left, top, left, top] },
      { linked: false, points: [right, top, right, top, right, top] },
      { linked: false, points: [right, bottom, right, bottom, right, bottom] },
      { linked: false, points: [left, bottom, left, bottom, left, bottom] },
    ] })
    const layer: Layer = {
      name: 'Compound badge',
      vectorFill: {
        type: 'solid', name: 'Sunset', style: 'linear', angle: 35, scale: 120,
        colorStops: [
          { color: { r: 255, g: 40, b: 80 }, location: 0, midpoint: 50 },
          { color: { r: 80, g: 40, b: 255 }, location: 4096, midpoint: 50 },
        ],
        opacityStops: [{ opacity: 1, location: 0, midpoint: 50 }, { opacity: 0.5, location: 4096, midpoint: 50 }],
      },
      vectorMask: { paths: [
        { ...square(20, 20, 220, 180), operation: 'combine' },
        { ...square(80, 60, 160, 140), operation: 'subtract' },
      ] },
      vectorStroke: {
        strokeEnabled: true, fillEnabled: true, lineWidth: { units: 'Pixels', value: 6 }, lineAlignment: 'outside',
        lineCapType: 'round', lineJoinType: 'bevel', miterLimit: 4, lineDashOffset: { units: 'Pixels', value: 2 },
        lineDashSet: [{ units: 'Pixels', value: 12 }, { units: 'Pixels', value: 4 }], opacity: 0.75, blendMode: 'multiply',
        content: { type: 'color', color: { r: 20, g: 30, b: 40 } },
      },
    }

    const imported = psdShapeLayer(layer, 300, 200)
    expect(imported).toMatchObject({
      shape: 'path',
      fill: '#ff2850',
      fillStyle: { type: 'gradient', name: 'Sunset', angle: 35, scale: 120, colorStops: [{ color: '#ff2850', position: 0 }, { color: '#5028ff', position: 1 }] },
      vectorPaths: [{ operation: 'combine' }, { operation: 'subtract' }],
      stroke: '#141e28',
      strokeWidth: 6,
      strokeStyle: { alignment: 'outside', cap: 'round', join: 'bevel', miterLimit: 4, dashOffset: 2, dashes: [12, 4], opacity: 0.75, blendMode: 'multiply' },
    })
    expect(psdImportWarnings({ width: 300, height: 200, children: [layer] })).not.toEqual(expect.arrayContaining([expect.stringMatching(/vector|mask/i)]))

    const blob = await exportPsdDocument({ ...initialDocument, canvasPreset: 'custom', canvasSize: { width: 300, height: 200 }, layers: imported ? [imported] : [] }, {})
    const roundTripped = readPsd(await blob.arrayBuffer(), { useImageData: true, skipThumbnail: true }).children?.[0]
    expect(roundTripped).toMatchObject({
      vectorFill: { type: 'solid', name: 'Sunset', angle: 35, scale: 120, colorStops: [{ location: 0 }, { location: 4096 }] },
      vectorMask: { paths: [{ operation: 'combine' }, { operation: 'subtract' }] },
      vectorStroke: { lineAlignment: 'outside', lineCapType: 'round', lineJoinType: 'bevel', lineDashSet: [{ value: 12 }, { value: 4 }] },
    })
  })

  it('preserves supported Photoshop adjustment layers', () => {
    expect(psdAdjustmentLayer({
      name: 'Tone',
      opacity: 0.8,
      blendMode: 'soft light',
      adjustment: { type: 'brightness/contrast', brightness: 18, contrast: -12 },
    }, 0)).toMatchObject({
      type: 'adjustment', name: 'Tone', opacity: 80, blendMode: 'soft-light', brightness: 118, contrast: 88,
    })
    expect(psdAdjustmentLayer({
      adjustment: { type: 'hue/saturation', master: { a: 0, b: 0, c: 0, d: 0, hue: 24, saturation: -20, lightness: 6 } },
    }, 1)).toMatchObject({ hue: 24, saturation: 80, brightness: 106 })
    expect(psdAdjustmentLayer({ adjustment: { type: 'curves', rgb: [{ input: 0, output: 0 }, { input: 255, output: 220 }] } }, 2))
      .toMatchObject({ adjustment: { type: 'curves', rgb: [{ input: 0, output: 0 }, { input: 255, output: 220 }] } })
  })

  it('round-trips every Photoshop adjustment descriptor as typed Studio data', async () => {
    const sources: NonNullable<Layer['adjustment']>[] = [
      { type: 'levels', rgb: { shadowInput: 12, highlightInput: 240, shadowOutput: 4, highlightOutput: 250, midtoneInput: 1.2 } },
      { type: 'curves', rgb: [{ input: 0, output: 5 }, { input: 128, output: 150 }, { input: 255, output: 250 }] },
      { type: 'exposure', exposure: 0.7, offset: 0.02, gamma: 1.1 },
      { type: 'vibrance', vibrance: 32, saturation: -8 },
      { type: 'color balance', shadows: { cyanRed: 4, magentaGreen: -2, yellowBlue: 8 }, preserveLuminosity: true },
      { type: 'black & white', reds: 42, yellows: 60, greens: 38, cyans: 58, blues: 22, magentas: 78, useTint: true, tintColor: { r: 220, g: 180, b: 140 } },
      { type: 'photo filter', color: { r: 255, g: 170, b: 80 }, density: 35, preserveLuminosity: true },
      { type: 'channel mixer', monochrome: false, red: { red: 110, green: -10, blue: 0, constant: 2 } },
      { type: 'color lookup', lookupType: '3dlut', name: 'Local LUT', dither: true, lutFormat: 'cube', lut3DFileName: 'warm.cube', lut3DFileData: Uint8Array.from([1, 2, 3, 4]) },
      { type: 'invert' },
      { type: 'posterize', levels: 7 },
      { type: 'threshold', level: 142 },
      { type: 'gradient map', name: 'Duo', gradientType: 'solid', dither: true, reverse: false, colorStops: [{ color: { r: 10, g: 20, b: 30 }, location: 0, midpoint: 50 }, { color: { r: 240, g: 220, b: 180 }, location: 4096, midpoint: 50 }] },
      { type: 'selective color', mode: 'relative', reds: { c: 4, m: -8, y: 12, k: 0 }, neutrals: { c: 0, m: 2, y: -3, k: 1 } },
    ]
    const layers = sources.map((source, index) => {
      const imported = psdAdjustmentLayer({ name: source.type, adjustment: source }, index)
      expect(imported?.adjustment?.type).toBe(source.type)
      return { ...imported!, stackOrder: index }
    })
    const blob = await exportPsdDocument({ ...initialDocument, canvasPreset: 'custom', canvasSize: { width: 32, height: 32 }, layers }, {})
    const decoded = readPsd(await blob.arrayBuffer(), { useImageData: true, skipThumbnail: true }).children ?? []
    expect(decoded.map((layer) => layer.adjustment?.type).reverse()).toEqual(sources.map((source) => source.type))
    expect(decoded.find((layer) => layer.adjustment?.type === 'color lookup')?.adjustment).toMatchObject({ name: 'Local LUT', lut3DFileName: 'warm.cube' })
    expect(decoded.find((layer) => layer.adjustment?.type === 'gradient map')?.adjustment).toMatchObject({ name: 'Duo', colorStops: [{ location: 0 }, { location: 4096 }] })
  })

  it('previews embedded ICC lookups while re-exporting the original profile bytes', async () => {
    const profile = iccLookupProfile('link')
    const imageData = new ImageData(4, 4)
    imageData.data.fill(255)
    const source: Psd = {
      width: 4, height: 4, imageData,
      children: [{ name: 'ICC Lookup', adjustment: { type: 'color lookup', lookupType: 'deviceLinkProfile', name: 'Invert red', dither: false, profile } }],
    }
    const imported = await importPsdBuffer(writePsd(source, { noBackground: true }), 'icc-lookup.psd')
    const adjustment = imported.document.layers.find((layer) => layer.type === 'adjustment')
    expect(adjustment?.type === 'adjustment' ? adjustment.adjustment : undefined).toMatchObject({ type: 'color lookup', iccPreview: { size: 17 } })
    expect(imported.warnings).not.toContain(expect.stringContaining('cannot yet be previewed'))

    const blob = await exportPsdDocument(imported.document, imported.assets)
    const decoded = readPsd(await blob.arrayBuffer(), { useImageData: true, skipThumbnail: true })
    const exported = decoded.children?.find((layer) => layer.adjustment?.type === 'color lookup')?.adjustment
    expect(exported?.type === 'color lookup' ? [...(exported.profile ?? [])] : []).toEqual([...profile])
  })

  it('preserves simple single-style text and ignores default blending ranges', () => {
    const layer: Layer = {
      name: 'Heading',
      left: 20,
      top: 30,
      right: 220,
      bottom: 90,
      blendingRanges: {
        compositeGrayBlendSource: [0, 0, 255, 255],
        compositeGraphBlendDestinationRange: [0, 0, 255, 255],
        ranges: [{ sourceRange: [0, 0, 255, 255], destRange: [0, 0, 255, 255] }],
      },
      mask: { canvas: {} as HTMLCanvasElement, defaultColor: 255 },
      text: {
        text: 'Happy birthday',
        style: { font: { name: 'Inter-SemiBold' }, fontSize: 32, fillColor: { r: 12, g: 34, b: 56 }, tracking: 50 },
        paragraphStyle: { justification: 'center' },
      },
    }

    expect(psdTextLayer(layer, 400, 200)).toMatchObject({
      type: 'text',
      text: 'Happy birthday',
      color: '#0c2238',
      fontFamily: 'Inter-SemiBold',
      fontSize: 32,
      fontWeight: 600,
      textAlign: 'center',
      letterSpacing: 1.6,
      position: { x: -0.2, y: -0.2 },
    })
    expect(psdImportWarnings({ width: 400, height: 200, children: [layer] }))
      .not.toContain(expect.stringContaining('Advanced blending'))
    expect(psdImportWarnings({ width: 400, height: 200, children: [layer] }))
      .not.toContain(expect.stringContaining('text was rasterized'))
    expect(psdImportWarnings({ width: 400, height: 200, children: [layer] }))
      .not.toContain(expect.stringContaining('masks were not preserved'))
  })

  it('preserves mixed styles, paragraph boxes, vertical orientation, warps, and missing fonts', async () => {
    const layer: Layer = {
      name: 'Mixed heading',
      left: 10,
      top: 20,
      right: 210,
      bottom: 140,
      text: {
        text: 'Hello\rworld',
        orientation: 'vertical',
        shapeType: 'box',
        boxBounds: [0, 0, 200, 120],
        warp: { style: 'arc', value: 35, perspective: 4, perspectiveOther: -2, rotate: 'vertical' },
        styleRuns: [
          { length: 5, style: { font: { name: 'Missing Sans' }, fontSize: 30, fillColor: { r: 255, g: 40, b: 80 }, tracking: 20, underline: true, autoKerning: false, ligatures: true, dLigatures: true } },
          { length: 6, style: { font: { name: 'Missing Serif Bold' }, fontSize: 18, fillColor: { r: 40, g: 90, b: 255 }, fauxBold: true, baselineShift: 3 } },
        ],
        paragraphStyleRuns: [
          { length: 6, style: { justification: 'center', firstLineIndent: 8 } },
          { length: 5, style: { justification: 'justify-left', spaceBefore: 4 } },
        ],
      },
    }

    const imported = psdTextLayer(layer, 300, 200)
    expect(imported).toMatchObject({
      orientation: 'vertical',
      paragraphBox: { width: 200, height: 120 },
      warp: { style: 'arc', value: 35, perspective: 4, perspectiveOther: -2, rotate: 'vertical' },
      styleRuns: [
        { start: 0, length: 5, fontFamily: 'Missing Sans', fontSize: 30, color: '#ff2850', underline: true, kerning: 'none', openTypeFeatures: ['liga', 'dlig'] },
        { start: 5, length: 6, fontFamily: 'Missing Serif Bold', fontWeight: 700, baselineShift: 3 },
      ],
      paragraphRuns: [
        { start: 0, length: 6, textAlign: 'center', firstLineIndent: 8 },
        { start: 6, length: 5, textAlign: 'justify', spaceBefore: 4 },
      ],
      missingFonts: ['Missing Sans', 'Missing Serif Bold'],
    })
    expect(psdImportWarnings({ width: 300, height: 200, children: [layer] })).not.toContain(expect.stringContaining('text was rasterized'))

    const blob = await exportPsdDocument({
      ...initialDocument,
      canvasPreset: 'custom',
      canvasSize: { width: 300, height: 200 },
      layers: imported ? [imported] : [],
    }, {})
    const roundTripped = readPsd(await blob.arrayBuffer(), { useImageData: true, skipThumbnail: true }).children?.[0]?.text
    expect(roundTripped).toMatchObject({
      orientation: 'vertical',
      shapeType: 'box',
      boxBounds: [0, 0, 200, 120],
      warp: { style: 'arc', value: 35, perspective: 4, perspectiveOther: -2, rotate: 'vertical' },
      styleRuns: [{ length: 5, style: { autoKerning: false, dLigatures: true } }, { length: 6 }],
      paragraphStyleRuns: [{ length: 6 }, { length: 5 }],
    })
  })

  it('round-trips compound vector masks, mask parameters, Blend If, and channel metadata', async () => {
    const square = (left: number, top: number, right: number, bottom: number, operation: 'combine' | 'subtract') => ({
      closed: true,
      operation,
      fillRule: 'non-zero' as const,
      knots: [
        { linked: true, in: { x: left, y: top }, anchor: { x: left, y: top }, out: { x: left, y: top } },
        { linked: true, in: { x: right, y: top }, anchor: { x: right, y: top }, out: { x: right, y: top } },
        { linked: true, in: { x: right, y: bottom }, anchor: { x: right, y: bottom }, out: { x: right, y: bottom } },
        { linked: true, in: { x: left, y: bottom }, anchor: { x: left, y: bottom }, out: { x: left, y: bottom } },
      ],
    })
    const text = {
      ...createTextLayer(0),
      vectorMask: {
        paths: [square(0.1, 0.1, 0.9, 0.9, 'combine'), square(0.4, 0.4, 0.6, 0.6, 'subtract')],
        density: 72,
        feather: 3.5,
        inverted: true,
        disabled: false,
        linked: false,
        fillStartsWithAllPixels: false,
      },
      blendIf: {
        source: [12, 28, 220, 244],
        destination: [4, 16, 232, 250],
        channels: [{ source: [8, 24, 210, 240], destination: [2, 12, 230, 248] }],
      },
    }
    const blob = await exportPsdDocument({
      ...initialDocument,
      canvasPreset: 'custom',
      canvasSize: { width: 200, height: 100 },
      layers: [text],
      channels: [{ id: 41, name: 'Saved selection' }],
    }, {})
    const decoded = readPsd(await blob.arrayBuffer(), { useImageData: true, skipThumbnail: true })
    const layer = decoded.children?.[0]
    expect(layer).toBeDefined()
    expect(psdVectorMask(layer!, 200, 100)).toMatchObject({
      paths: [{ operation: 'combine' }, { operation: 'subtract' }],
      density: 72,
      feather: 3.5,
      inverted: true,
      linked: false,
    })
    expect(psdMaskSettings(layer!)).toBeUndefined()
    expect(psdBlendIf(layer!)).toEqual(text.blendIf)
    expect(decoded.imageResources).toMatchObject({ alphaChannelNames: ['Saved selection'], alphaIdentifiers: [41] })
    expect(psdImportWarnings({ width: 200, height: 100, children: [layer!] }))
      .not.toEqual(expect.arrayContaining([expect.stringMatching(/mask|advanced blending/i)]))
  })

  it('decodes, edits, and rewrites extra alpha-channel pixels', async () => {
    const channelCanvas = createCanvas(2, 2) as unknown as HTMLCanvasElement
    const channelContext = channelCanvas.getContext('2d')!
    const channelPixels = channelContext.createImageData(2, 2)
    ;[0, 64, 128, 255].forEach((value, pixel) => {
      channelPixels.data[pixel * 4] = value
      channelPixels.data[pixel * 4 + 1] = value
      channelPixels.data[pixel * 4 + 2] = value
      channelPixels.data[pixel * 4 + 3] = 255
    })
    channelContext.putImageData(channelPixels, 0, 0)
    const channelAsset = { element: channelCanvas as unknown as HTMLImageElement, name: 'Selection', surface: channelCanvas, revision: 0 }
    const shape = { ...createShapeLayer('rectangle', 0), width: 100, height: 100 }
    const blob = await exportPsdDocument({
      ...initialDocument,
      canvasPreset: 'custom',
      canvasSize: { width: 2, height: 2 },
      layers: [shape],
      channels: [{ id: 9, name: 'Selection', assetId: 'selection-channel' }],
    }, { 'selection-channel': channelAsset })
    const bytes = await blob.arrayBuffer()
    const decoded = readPsd(bytes, { useImageData: true, skipThumbnail: true })
    expect(decoded.imageResources).toMatchObject({ alphaChannelNames: ['Selection'], alphaIdentifiers: [9] })

    const imported = await importPsdBuffer(bytes, 'channels.psd')
    expect(imported.document.channels).toHaveLength(1)
    const assetId = imported.document.channels![0].assetId!
    const pixels = imported.assets[assetId].surface!.getContext('2d')!.getImageData(0, 0, 2, 2).data
    expect([pixels[0], pixels[4], pixels[8], pixels[12]]).toEqual([0, 64, 128, 255])

    pixels[4] = pixels[5] = pixels[6] = 96
    const editedPixels = imported.assets[assetId].surface!.getContext('2d')!.createImageData(2, 2)
    editedPixels.data.set(pixels)
    imported.assets[assetId].surface!.getContext('2d')!.putImageData(editedPixels, 0, 0)
    const edited = await exportPsdDocument(imported.document, imported.assets)
    const reopened = await importPsdBuffer(await edited.arrayBuffer(), 'edited-channels.psd')
    const reopenedAsset = reopened.assets[reopened.document.channels![0].assetId!].surface!
    expect(reopenedAsset.getContext('2d')!.getImageData(1, 0, 1, 1).data[0]).toBe(96)
  })

  it('preserves placed-layer, linked-file, guide, layer-comp, and document metadata', async () => {
    const imageData = new ImageData(4, 4)
    imageData.data.fill(255)
    const linkedId = '20953ddb-9391-11ec-b4f1-c15674f50bc4'
    const source: Psd = {
      width: 4,
      height: 4,
      imageData,
      children: [{
        id: 77, name: 'Embedded artwork', left: 0, top: 0, right: 4, bottom: 4, imageData,
        placedLayer: { id: linkedId, type: 'raster', transform: [0, 0, 4, 0, 4, 4, 0, 4], width: 4, height: 4 },
      }],
      linkedFiles: [{ id: linkedId, name: 'artwork.psb', type: '8BPS', creator: '8BIM', data: Uint8Array.from([8, 66, 80, 83, 0, 1]) }],
      imageResources: {
        gridAndGuidesInformation: { grid: { horizontal: 32, vertical: 32 }, guides: [{ direction: 'vertical', location: 2 }] },
        resolutionInfo: { horizontalResolution: 300, horizontalResolutionUnit: 'PPI', widthUnit: 'Inches', verticalResolution: 300, verticalResolutionUnit: 'PPI', heightUnit: 'Inches' },
        xmpMetadata: '<x:xmpmeta>local metadata</x:xmpmeta>',
        layerComps: { list: [{ id: 5, name: 'Hero', capturedInfo: LayerCompCapturedInfo.Visibility | LayerCompCapturedInfo.Position | LayerCompCapturedInfo.Appearance }], lastApplied: 5 },
      },
    }
    const imported = await importPsdBuffer(writePsd(source, { noBackground: true }), 'metadata.psd')
    expect(imported.document.guides).toEqual([{ id: 'psd-guide-0', direction: 'vertical', position: 2 }])
    expect(imported.document.layers[0]).toMatchObject({ type: 'smart-object', source: { kind: 'embedded', fileName: 'artwork.psb', linkedFileId: linkedId }, psdLayerId: 77, psdPlacedLayer: { id: linkedId, type: 'raster' } })
    expect(imported.warnings).not.toContain(expect.stringContaining('Smart objects'))
    expect(imported.document.psdMetadata).toMatchObject({ imageResources: { xmpMetadata: '<x:xmpmeta>local metadata</x:xmpmeta>' }, linkedFiles: [{ id: linkedId, name: 'artwork.psb', data: { __studioBytes: [8, 66, 80, 83, 0, 1] } }] })

    const blob = await exportPsdDocument(imported.document, imported.assets)
    const decoded = readPsd(await blob.arrayBuffer(), { useImageData: true, skipThumbnail: true })
    expect(decoded.children?.[0]).toMatchObject({ id: 77, placedLayer: { id: linkedId, type: 'raster', width: 4, height: 4 } })
    expect(decoded.linkedFiles?.[0]).toMatchObject({ id: linkedId, name: 'artwork.psb' })
    expect([...decoded.linkedFiles![0].data!]).toEqual([8, 66, 80, 83, 0, 1])
    expect(decoded.imageResources).toMatchObject({
      gridAndGuidesInformation: { guides: [{ direction: 'vertical', location: 2 }] },
      resolutionInfo: { horizontalResolution: 300, verticalResolution: 300 },
      xmpMetadata: '<x:xmpmeta>local metadata</x:xmpmeta>',
      layerComps: { list: [{ id: 5, name: 'Hero', capturedInfo: 7 }], lastApplied: 5 },
    })
  })

  it('maps externally linked placed layers to linked smart-object sources', () => {
    const linkedId = '20953ddb-9391-11ec-b4f1-c15674f50bc5'
    expect(psdSmartObjectSource(
      { id: linkedId, type: 'raster', transform: [0, 0, 2, 0, 2, 2, 0, 2] },
      { id: linkedId, name: 'linked.png', linkedFile: { fileSize: 128, name: 'linked.png', fullPath: '/Artwork/linked.png', originalPath: '/Artwork/linked.png', relativePath: './linked.png' } },
    )).toEqual({ kind: 'linked', fileName: 'linked.png', linkedFileId: linkedId, path: '/Artwork/linked.png', lastModified: undefined })
  })

  it('maps editable PSD smart-filter parameters to local filter settings', () => {
    expect(psdSmartFilterSettings({
      type: 'gaussian blur', name: 'Gaussian Blur', enabled: true, opacity: 1, blendMode: 'normal', hasOptions: true,
      foregroundColor: { r: 0, g: 0, b: 0 }, backgroundColor: { r: 255, g: 255, b: 255 }, filter: { radius: { units: 'Pixels', value: 7 } },
    })).toMatchObject({ blur: 7, invert: 0, contrast: 100 })
  })

  it('opens embedded PSB smart-object contents as a nested document', async () => {
    const imageData = new ImageData(2, 2)
    imageData.data.fill(255)
    const nestedBytes = new Uint8Array(writePsd({ width: 2, height: 2, imageData, children: [{ name: 'Nested pixels', left: 0, top: 0, right: 2, bottom: 2, imageData }] }, { noBackground: true }))
    const linkedId = '20953ddb-9391-11ec-b4f1-c15674f50bc6'
    const imported = await importPsdBuffer(writePsd({
      width: 2,
      height: 2,
      imageData,
      children: [{ name: 'Embedded', left: 0, top: 0, right: 2, bottom: 2, imageData, placedLayer: { id: linkedId, type: 'raster', transform: [0, 0, 2, 0, 2, 2, 0, 2], width: 2, height: 2 } }],
      linkedFiles: [{ id: linkedId, name: 'embedded.psb', type: '8BPS', data: nestedBytes }],
    }, { noBackground: true }), 'embedded.psd')

    const smartObject = imported.document.layers[0]
    expect(smartObject).toMatchObject({ type: 'smart-object', embeddedDocument: { layers: [{ name: 'Nested pixels' }] } })
    if (smartObject.type === 'smart-object') expect(imported.assets[smartObject.embeddedDocument!.layers[0].type === 'raster' ? smartObject.embeddedDocument!.layers[0].assetId : '']).toBeDefined()
  })
})
