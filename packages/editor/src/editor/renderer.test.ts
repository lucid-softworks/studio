import { createCanvas, ImageData } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { createRasterLayer, createShapeLayer, createSmartObjectLayer, initialDocument } from './presets'
import { defaultLayerEffects } from './effects'
import { calculateImageRect, clearSmartFilterResultCache, findResizeHandle, getLayerBounds, getResizeHandles, renderComposition, selectMipmapLevel, smartFilterResultCacheSize } from './renderer'
import { resolveRasterTarget } from './raster-target'
import type { ImageLayer } from './types'

Object.assign(globalThis, {
  ImageData,
  document: { createElement: () => createCanvas(1, 1) },
})

const imageLayer: ImageLayer = {
  id: 'image-1',
  type: 'image',
  assetId: 'asset-1',
  name: 'Screenshot',
  visible: true,
  locked: false,
  opacity: 100,
  position: { x: 0, y: 0 },
  rotation: 0,
  padding: 12,
  scale: 100,
  cornerRadius: 18,
  shadow: 48,
  flipX: false,
  flipY: false,
}

describe('mipmap selection', () => {
  it('selects bounded levels only when both dimensions are downscaled', () => {
    expect(selectMipmapLevel(4096, 2048, 512, 256)).toBe(3)
    expect(selectMipmapLevel(4096, 2048, 4096, 256)).toBe(0)
    expect(selectMipmapLevel(65_536, 65_536, 1, 1)).toBe(8)
  })
})

describe('raster content bounds', () => {
  it('does not expose transform handles for a known-empty raster layer', () => {
    const canvas = createCanvas(100, 100) as unknown as HTMLCanvasElement
    const surface = createCanvas(100, 100) as unknown as HTMLCanvasElement
    const layer = createRasterLayer('blank', 'Blank', 100, 100)
    const asset = { element: {} as HTMLImageElement, name: 'Blank', surface, contentBounds: null }
    expect(getLayerBounds(canvas.getContext('2d')!, canvas, layer, { blank: asset })).toBeNull()
  })

  it('keeps a known-empty raster layer available to painting tools', () => {
    const canvas = createCanvas(100, 100) as unknown as HTMLCanvasElement
    const surface = createCanvas(100, 100) as unknown as HTMLCanvasElement
    const layer = createRasterLayer('blank', 'Blank', 100, 100)
    const asset = { element: {} as HTMLImageElement, name: 'Blank', surface, contentBounds: null }
    const target = resolveRasterTarget(canvas, { ...initialDocument, layers: [layer], selectedLayerId: layer.id, selectedLayerIds: [layer.id] }, { blank: asset })
    expect(target?.bounds).toEqual({ x: 0, y: 0, width: 100, height: 100, rotation: 0 })
  })

  it('maps indexed pixel bounds into the document transform', () => {
    const canvas = createCanvas(100, 100) as unknown as HTMLCanvasElement
    const surface = createCanvas(100, 100) as unknown as HTMLCanvasElement
    const layer = createRasterLayer('paint', 'Paint', 100, 100)
    const asset = { element: {} as HTMLImageElement, name: 'Paint', surface, contentBounds: { x: 20, y: 30, width: 40, height: 20 } }
    expect(getLayerBounds(canvas.getContext('2d')!, canvas, layer, { paint: asset })).toEqual({ x: 20, y: 30, width: 40, height: 20, rotation: 0 })
  })
})

describe('artboard backgrounds', () => {
  it('renders independent colour and transparent artboard regions', () => {
    const canvas = createCanvas(20, 10) as unknown as HTMLCanvasElement
    renderComposition(canvas, {
      ...initialDocument,
      canvasPreset: 'custom',
      canvasSize: { width: 20, height: 10 },
      artboards: [
        { id: 'left', name: 'Left', x: 0, y: 0, width: 10, height: 10, background: { kind: 'color', color: '#ff0000' } },
        { id: 'right', name: 'Right', x: 10, y: 0, width: 10, height: 10, background: { kind: 'transparent', color: '#ffffff' } },
      ],
    }, {})
    expect([...canvas.getContext('2d')!.getImageData(5, 5, 1, 1).data]).toEqual([255, 0, 0, 255])
    expect(canvas.getContext('2d')!.getImageData(15, 5, 1, 1).data[3]).toBe(0)
  })
})

describe('advanced masks', () => {
  it('renders compound vector masks with density and Blend If thresholds', () => {
    const path = (left: number, right: number) => ({
      closed: true,
      operation: 'combine' as const,
      fillRule: 'non-zero' as const,
      knots: [
        { linked: true, in: { x: left, y: 0 }, anchor: { x: left, y: 0 }, out: { x: left, y: 0 } },
        { linked: true, in: { x: right, y: 0 }, anchor: { x: right, y: 0 }, out: { x: right, y: 0 } },
        { linked: true, in: { x: right, y: 1 }, anchor: { x: right, y: 1 }, out: { x: right, y: 1 } },
        { linked: true, in: { x: left, y: 1 }, anchor: { x: left, y: 1 }, out: { x: left, y: 1 } },
      ],
    })
    const layer = {
      ...createShapeLayer('rectangle', 0),
      width: 100,
      height: 100,
      fill: '#ff0000',
      vectorMask: { paths: [path(0, 0.5)], density: 50, feather: 0, inverted: false, disabled: false, linked: true, fillStartsWithAllPixels: false },
    }
    const canvas = createCanvas(100, 100) as unknown as HTMLCanvasElement
    renderComposition(canvas, { ...initialDocument, canvasPreset: 'custom', canvasSize: { width: 100, height: 100 }, layers: [layer] }, {})
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, 100, 100)
    expect(pixels.data[(50 * 100 + 25) * 4 + 3]).toBe(255)
    expect(pixels.data[(50 * 100 + 75) * 4 + 3]).toBeCloseTo(128, 0)

    renderComposition(canvas, {
      ...initialDocument,
      canvasPreset: 'custom',
      canvasSize: { width: 100, height: 100 },
      layers: [{ ...layer, vectorMask: undefined, blendIf: { source: [100, 100, 255, 255], destination: [0, 0, 255, 255], channels: [] } }],
    }, {})
    expect(canvas.getContext('2d')!.getImageData(50, 50, 1, 1).data[3]).toBe(0)
  })
})

describe('smart-object rendering', () => {
  it('renders through an affine source matrix without changing the source surface', () => {
    const source = createCanvas(2, 2)
    const sourceContext = source.getContext('2d')!
    sourceContext.fillStyle = '#ff0000'
    sourceContext.fillRect(0, 0, 2, 2)
    const layer = createSmartObjectLayer('smart-source', 'Placed', 2, 2, { kind: 'embedded', fileName: 'placed.psb' })
    layer.transformMatrix = [2, 0, 0, 2, 3, 4]
    const canvas = createCanvas(12, 12) as unknown as HTMLCanvasElement

    renderComposition(canvas, { ...initialDocument, canvasPreset: 'custom', canvasSize: { width: 12, height: 12 }, layers: [layer] }, {
      'smart-source': { element: source as unknown as HTMLImageElement, surface: source as unknown as HTMLCanvasElement, name: 'Placed' },
    })

    expect([...canvas.getContext('2d')!.getImageData(4, 5, 1, 1).data]).toEqual([255, 0, 0, 255])
    expect(canvas.getContext('2d')!.getImageData(1, 1, 1, 1).data[3]).toBe(0)
    expect(source.width).toBe(2)
  })

  it('evaluates ordered smart filters through their opacity, blend, and mask settings', () => {
    clearSmartFilterResultCache()
    const source = createCanvas(2, 1)
    const sourceContext = source.getContext('2d')!
    sourceContext.fillStyle = '#ff0000'
    sourceContext.fillRect(0, 0, 2, 1)
    const mask = createCanvas(2, 1)
    const maskContext = mask.getContext('2d')!
    maskContext.fillStyle = '#ffffff'
    maskContext.fillRect(0, 0, 1, 1)
    maskContext.fillStyle = '#000000'
    maskContext.fillRect(1, 0, 1, 1)
    const layer = createSmartObjectLayer('smart-source', 'Filtered', 2, 1, { kind: 'embedded', fileName: 'filtered.psb' })
    layer.transformMatrix = [3, 0, 0, 3, 1, 1]
    layer.contentHash = 'source-red-v1'
    layer.smartFilters = [{
      id: 'invert', name: 'Invert', visible: true, opacity: 100, blendMode: 'normal', maskAssetId: 'filter-mask',
      settings: { brightness: 100, contrast: 100, saturation: 100, hue: 0, grayscale: 0, sepia: 0, invert: 100, blur: 0 },
      descriptor: { type: 'invert' },
    }]
    const canvas = createCanvas(8, 5) as unknown as HTMLCanvasElement
    const assets = {
      'smart-source': { element: source as unknown as HTMLImageElement, surface: source as unknown as HTMLCanvasElement, name: 'Filtered' },
      'filter-mask': { element: mask as unknown as HTMLImageElement, surface: mask as unknown as HTMLCanvasElement, name: 'Mask' },
    }
    const document = { ...initialDocument, canvasPreset: 'custom' as const, canvasSize: { width: 8, height: 5 }, layers: [layer] }
    renderComposition(canvas, document, assets)
    renderComposition(canvas, document, assets)

    expect([...canvas.getContext('2d')!.getImageData(2, 2, 1, 1).data]).toEqual([0, 255, 255, 255])
    expect([...canvas.getContext('2d')!.getImageData(5, 2, 1, 1).data]).toEqual([255, 0, 0, 255])
    expect(smartFilterResultCacheSize()).toBe(1)
    renderComposition(canvas, { ...document, layers: [{ ...layer, contentHash: 'source-red-v2' }] }, assets)
    expect(smartFilterResultCacheSize()).toBe(2)
  })
})

describe('advanced adjustment layers', () => {
  it('applies Camera Raw-style tonal and color controls entirely on-device', () => {
    const shape = { ...createShapeLayer('rectangle', 0), id: 'source', width: 100, height: 100, fill: '#808080', stackOrder: 0 }
    const adjustment = {
      id: 'camera-raw', type: 'adjustment' as const, name: 'Camera Raw', visible: true, locked: false, opacity: 100,
      position: { x: 0, y: 0 }, rotation: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, stackOrder: 1,
      adjustment: { type: 'camera raw' as const, temperature: 60, tint: 0, exposure: 0.5, contrast: 20, highlights: -20, shadows: 25, whites: 0, blacks: 0, texture: 10, clarity: 15, dehaze: 5, vibrance: 20, saturation: 0 },
    }
    const canvas = createCanvas(10, 10) as unknown as HTMLCanvasElement
    renderComposition(canvas, { ...initialDocument, canvasPreset: 'custom', canvasSize: { width: 10, height: 10 }, layers: [shape, adjustment] }, {})
    const pixel = canvas.getContext('2d')!.getImageData(5, 5, 1, 1).data
    expect(pixel[0]).toBeGreaterThan(pixel[2])
    expect(pixel[0]).toBeGreaterThan(128)
  })

  it('renders typed pixel adjustments without changing source layers', () => {
    const shape = { ...createShapeLayer('rectangle', 0), id: 'source', width: 100, height: 100, fill: '#ff0000', stackOrder: 0 }
    const adjustment = {
      id: 'invert', type: 'adjustment' as const, name: 'Invert', visible: true, locked: false, opacity: 100,
      position: { x: 0, y: 0 }, rotation: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0,
      adjustment: { type: 'invert' as const }, stackOrder: 1,
    }
    const canvas = createCanvas(20, 20) as unknown as HTMLCanvasElement
    renderComposition(canvas, { ...initialDocument, canvasPreset: 'custom', canvasSize: { width: 20, height: 20 }, layers: [shape, adjustment] }, {})
    expect([...canvas.getContext('2d')!.getImageData(10, 10, 1, 1).data]).toEqual([0, 255, 255, 255])
    expect(shape.fill).toBe('#ff0000')
  })

  it('evaluates embedded cube LUTs entirely on-device', () => {
    const shape = { ...createShapeLayer('rectangle', 0), id: 'source', width: 100, height: 100, fill: '#ff0000', stackOrder: 0 }
    const cube = `LUT_3D_SIZE 2
1 1 1
0 1 1
1 0 1
0 0 1
1 1 0
0 1 0
1 0 0
0 0 0`
    const adjustment = {
      id: 'lookup', type: 'adjustment' as const, name: 'Lookup', visible: true, locked: false, opacity: 100,
      position: { x: 0, y: 0 }, rotation: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, stackOrder: 1,
      adjustment: { type: 'color lookup' as const, dither: false, lutFormat: 'cube' as const, lut3DFileData: [...new TextEncoder().encode(cube)] },
    }
    const canvas = createCanvas(10, 10) as unknown as HTMLCanvasElement
    renderComposition(canvas, { ...initialDocument, canvasPreset: 'custom', canvasSize: { width: 10, height: 10 }, layers: [shape, adjustment] }, {})
    expect([...canvas.getContext('2d')!.getImageData(5, 5, 1, 1).data]).toEqual([0, 255, 255, 255])
  })

  it('evaluates integer .3dl LUTs and their input shaper entirely on-device', () => {
    const shape = { ...createShapeLayer('rectangle', 0), id: 'source', width: 100, height: 100, fill: '#0000ff', stackOrder: 0 }
    const lut3dl = `3DMESH
Mesh 1 12
0 4095
0 0 4095
0 0 0
0 4095 4095
0 4095 0
4095 0 4095
4095 0 0
4095 4095 4095
4095 4095 0`
    const adjustment = {
      id: 'lookup', type: 'adjustment' as const, name: 'Lookup', visible: true, locked: false, opacity: 100,
      position: { x: 0, y: 0 }, rotation: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, stackOrder: 1,
      adjustment: { type: 'color lookup' as const, dither: false, lutFormat: '3dl' as const, lut3DFileData: [...new TextEncoder().encode(lut3dl)] },
    }
    const canvas = createCanvas(10, 10) as unknown as HTMLCanvasElement
    renderComposition(canvas, { ...initialDocument, canvasPreset: 'custom', canvasSize: { width: 10, height: 10 }, layers: [shape, adjustment] }, {})
    expect([...canvas.getContext('2d')!.getImageData(5, 5, 1, 1).data]).toEqual([0, 0, 0, 255])
  })

  it('evaluates embedded Iridas .look LUTs entirely on-device', () => {
    const encodeFloat = (value: number) => {
      const bytes = new Uint8Array(4)
      new DataView(bytes.buffer).setFloat32(0, value, true)
      return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    }
    const values = [
      [1, 1, 1], [0, 1, 1], [1, 0, 1], [0, 0, 1],
      [1, 1, 0], [0, 1, 0], [1, 0, 0], [0, 0, 0],
    ]
    const look = `<?xml version="1.0"?><look><shaders /><LUT><size>"2"</size><data>"${values.flat().map(encodeFloat).join('')}"</data></LUT></look>`
    const shape = { ...createShapeLayer('rectangle', 0), id: 'source', width: 100, height: 100, fill: '#ff0000', stackOrder: 0 }
    const adjustment = {
      id: 'lookup', type: 'adjustment' as const, name: 'Lookup', visible: true, locked: false, opacity: 100,
      position: { x: 0, y: 0 }, rotation: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, stackOrder: 1,
      adjustment: { type: 'color lookup' as const, dither: false, lutFormat: 'look' as const, lut3DFileData: [...new TextEncoder().encode(look)] },
    }
    const canvas = createCanvas(10, 10) as unknown as HTMLCanvasElement
    renderComposition(canvas, { ...initialDocument, canvasPreset: 'custom', canvasSize: { width: 10, height: 10 }, layers: [shape, adjustment] }, {})
    expect([...canvas.getContext('2d')!.getImageData(5, 5, 1, 1).data]).toEqual([0, 255, 255, 255])
  })

  it('evaluates a baked ICC preview cube without loading the color engine while rendering', () => {
    const shape = { ...createShapeLayer('rectangle', 0), id: 'source', width: 100, height: 100, fill: '#ff0000', stackOrder: 0 }
    const values = [
      [255, 255, 255], [0, 255, 255], [255, 0, 255], [0, 0, 255],
      [255, 255, 0], [0, 255, 0], [255, 0, 0], [0, 0, 0],
    ].flat()
    const adjustment = {
      id: 'lookup', type: 'adjustment' as const, name: 'ICC Lookup', visible: true, locked: false, opacity: 100,
      position: { x: 0, y: 0 }, rotation: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, stackOrder: 1,
      adjustment: { type: 'color lookup' as const, lookupType: 'deviceLinkProfile' as const, dither: false, iccPreview: { size: 2, data: values } },
    }
    const canvas = createCanvas(10, 10) as unknown as HTMLCanvasElement
    renderComposition(canvas, { ...initialDocument, canvasPreset: 'custom', canvasSize: { width: 10, height: 10 }, layers: [shape, adjustment] }, {})
    expect([...canvas.getContext('2d')!.getImageData(5, 5, 1, 1).data]).toEqual([0, 255, 255, 255])
  })
})

describe('compound vector shapes', () => {
  it('renders reusable distort meshes through the Canvas2D compatibility path', () => {
    const shape = { ...createShapeLayer('rectangle', 0), width: 50, height: 50, fill: '#ff0000', geometryTransform: { skewX: 0, skewY: 0, perspectiveX: 0, perspectiveY: 0, corners: [{ x: 0.2, y: 0 }, { x: 0.2, y: 0 }, { x: 0.2, y: 0 }, { x: 0.2, y: 0 }] as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }], interpolation: 'nearest' as const, referencePoint: { x: 0.5, y: 0.5 } } }
    const canvas = createCanvas(20, 20) as unknown as HTMLCanvasElement
    renderComposition(canvas, { ...initialDocument, canvasPreset: 'custom', canvasSize: { width: 20, height: 20 }, layers: [shape] }, {})
    expect(canvas.getContext('2d')!.getImageData(6, 10, 1, 1).data[3]).toBe(0)
    expect([...canvas.getContext('2d')!.getImageData(8, 10, 1, 1).data]).toEqual([255, 0, 0, 255])
  })

  it('renders subtract operations as a transparent hole', () => {
    const rectangle = (left: number, top: number, right: number, bottom: number, operation: 'combine' | 'subtract') => ({
      closed: true, operation, fillRule: 'non-zero' as const,
      knots: [[left, top], [right, top], [right, bottom], [left, bottom]].map(([x, y]) => ({ linked: true, in: { x, y }, anchor: { x, y }, out: { x, y } })),
    })
    const shape = { ...createShapeLayer('path', 0), width: 100, height: 100, fill: '#ff0000', vectorPaths: [rectangle(0.1, 0.1, 0.9, 0.9, 'combine'), rectangle(0.4, 0.4, 0.6, 0.6, 'subtract')] }
    const canvas = createCanvas(20, 20) as unknown as HTMLCanvasElement

    renderComposition(canvas, { ...initialDocument, canvasPreset: 'custom', canvasSize: { width: 20, height: 20 }, layers: [shape] }, {})

    expect([...canvas.getContext('2d')!.getImageData(3, 3, 1, 1).data]).toEqual([255, 0, 0, 255])
    expect(canvas.getContext('2d')!.getImageData(10, 10, 1, 1).data[3]).toBe(0)
  })
})

describe('filled layer-effect strokes', () => {
  it('renders a gradient through the generated stroke mask', () => {
    const shape = {
      ...createShapeLayer('rectangle', 0), width: 30, height: 30, fill: '#ff0000',
      effects: { ...defaultLayerEffects, stroke: { ...defaultLayerEffects.stroke, enabled: true, size: 12, fillType: 'gradient' as const, gradient: { ...defaultLayerEffects.stroke.gradient, angle: 0, colorStops: [{ color: '#000000', position: 0 }, { color: '#ffffff', position: 1 }] } } },
    }
    const canvas = createCanvas(100, 100) as unknown as HTMLCanvasElement
    renderComposition(canvas, { ...initialDocument, canvasPreset: 'custom', canvasSize: { width: 100, height: 100 }, layers: [shape] }, {})
    const context = canvas.getContext('2d')!
    const left = context.getImageData(30, 50, 1, 1).data
    const right = context.getImageData(70, 50, 1, 1).data
    expect(left[3]).toBeGreaterThan(0)
    expect(right[3]).toBeGreaterThan(0)
    expect(right[0]).toBeGreaterThan(left[0])
  })
})

describe('calculateImageRect', () => {
  it('fits and centres a landscape image inside the padded canvas', () => {
    const rect = calculateImageRect(1600, 1000, 1400, 900, imageLayer)
    expect(rect.width).toBeCloseTo(1182.22, 1)
    expect(rect.height).toBeCloseTo(760, 1)
    expect(rect.x).toBeCloseTo(208.89, 1)
    expect(rect.y).toBeCloseTo(120, 1)
  })

  it('applies scale, position, and rotation per layer', () => {
    const rect = calculateImageRect(1200, 1200, 1200, 800, {
      ...imageLayer,
      scale: 50,
      position: { x: 0.1, y: -0.05 },
      rotation: 30,
    })
    expect(rect.width).toBeCloseTo(456)
    expect(rect.height).toBeCloseTo(304)
    expect(rect.x).toBeCloseTo(492)
    expect(rect.y).toBeCloseTo(388)
    expect(rect.rotation).toBe(30)
  })
})

describe('resize handles', () => {
  it('finds each corner of an unrotated layer', () => {
    const bounds = { x: 100, y: 50, width: 200, height: 100, rotation: 0 }
    expect(getResizeHandles(bounds)).toEqual({
      nw: { x: 100, y: 50 },
      n: { x: 200, y: 50 },
      ne: { x: 300, y: 50 },
      e: { x: 300, y: 100 },
      se: { x: 300, y: 150 },
      s: { x: 200, y: 150 },
      sw: { x: 100, y: 150 },
      w: { x: 100, y: 100 },
    })
    expect(findResizeHandle({ x: 305, y: 151 }, bounds, 6)).toBe('se')
    expect(findResizeHandle({ x: 200, y: 100 }, bounds, 6)).toBeNull()
  })

  it('rotates handle hit areas with the selected layer', () => {
    const bounds = { x: 100, y: 50, width: 200, height: 100, rotation: 90 }
    const handles = getResizeHandles(bounds)
    expect(handles.nw.x).toBeCloseTo(250)
    expect(handles.nw.y).toBeCloseTo(0)
    expect(findResizeHandle(handles.ne, bounds, 1)).toBe('ne')
  })
})
