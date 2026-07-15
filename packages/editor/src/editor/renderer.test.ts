import { describe, expect, it } from 'vitest'
import { calculateImageRect, findResizeHandle, getResizeHandles, selectMipmapLevel } from './renderer'
import type { ImageLayer } from './types'

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
