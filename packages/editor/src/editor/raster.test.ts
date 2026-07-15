import { describe, expect, it } from 'vitest'
import { extractImageData, floodFillImageData, hexToRgba } from './raster'

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

  it('flood fills a contiguous region and reports its dirty bounds', () => {
    const image = new ImageData(3, 2)
    const colors = [10, 10, 200, 10, 210, 200]
    colors.forEach((red, pixel) => {
      image.data[pixel * 4] = red
      image.data[pixel * 4 + 3] = 255
    })
    expect(floodFillImageData(image, 0, 0, [255, 0, 0, 255], 2)).toEqual({ x: 0, y: 0, width: 2, height: 2 })
    expect([image.data[0], image.data[4], image.data[12], image.data[16]]).toEqual([255, 255, 255, 210])
  })

  it('parses foreground colours for raster operations', () => {
    expect(hexToRgba('#ff3b81')).toEqual([255, 59, 129, 255])
    expect(hexToRgba('#0af', 128)).toEqual([0, 170, 255, 128])
  })
})
