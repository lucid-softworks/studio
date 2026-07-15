import { describe, expect, it } from 'vitest'
import { createCanvas, ImageData } from '@napi-rs/canvas'
import { readPsd, type Layer, type Psd } from 'ag-psd'
import { createLayerGroup, createShapeLayer, createTextLayer, initialDocument } from './presets'
import { exportPsdDocument, psdAdjustmentLayer, psdBlendIf, psdBlendMode, psdImportWarnings, psdLayerEffects, psdLayerNamesInEditorOrder, psdMaskSettings, psdShapeLayer, psdTextLayer, psdVectorMask } from './psd'

Object.assign(globalThis, {
  ImageData,
  document: { createElement: () => createCanvas(1, 1) },
})

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
          { name: 'Glow', effects: { stroke: [{ enabled: true, fillType: 'pattern' }] } },
          { name: 'Blend', blendMode: 'linear light' },
        ],
      }],
      imageResources: { gridAndGuidesInformation: { guides: [{ location: 40, direction: 'vertical' }] } },
    }

    expect(psdImportWarnings(psd)).toEqual(expect.arrayContaining([
      '16-bit channels were converted to 8-bit raster data',
      'The source color mode was converted to RGB',
      'PSD guides were not imported',
      'Complex text was rasterized: Artwork / Heading',
      'Some Photoshop-only layer effects were not preserved: Artwork / Glow',
      'Unsupported “linear light” blending was changed to normal: Artwork / Blend',
    ]))
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
    expect(psdAdjustmentLayer({ adjustment: { type: 'curves', rgb: [{ input: 0, output: 0 }] } }, 2)).toBeNull()
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
          { length: 5, style: { font: { name: 'Missing Sans' }, fontSize: 30, fillColor: { r: 255, g: 40, b: 80 }, tracking: 20, underline: true } },
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
        { start: 0, length: 5, fontFamily: 'Missing Sans', fontSize: 30, color: '#ff2850', underline: true },
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
      styleRuns: [{ length: 5 }, { length: 6 }],
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
})
