import { describe, expect, it } from 'vitest'
import { psdBlendMode, psdImportWarnings, psdLayerEffects, psdLayerNamesInEditorOrder, psdShapeLayer, psdTextLayer } from './psd'
import type { Layer, Psd } from 'ag-psd'

describe('PSD layer ordering', () => {
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
          { name: 'Glow', effects: { bevel: { enabled: true } } },
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
})
