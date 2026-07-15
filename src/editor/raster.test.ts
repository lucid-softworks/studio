import { describe, expect, it } from 'vitest'
import { extractImageData } from './raster'

class TestImageData {
  data: Uint8ClampedArray
  width: number
  height: number
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.data = new Uint8ClampedArray(width * height * 4)
  }
}

Object.assign(globalThis, { ImageData: TestImageData })

describe('raster region history', () => {
  it('extracts only the dirty rectangle from a full layer snapshot', () => {
    const source = new ImageData(3, 2)
    for (let pixel = 0; pixel < 6; pixel += 1) source.data[pixel * 4] = pixel + 1
    const region = extractImageData(source, 1, 0, 2, 2)
    expect(region.width).toBe(2)
    expect(region.height).toBe(2)
    expect([region.data[0], region.data[4], region.data[8], region.data[12]]).toEqual([2, 3, 5, 6])
  })
})
