import { ImageData as CanvasImageData } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { vectorizeImageData, type VectorizeOptions } from './vectorize'

Object.assign(globalThis, { ImageData: CanvasImageData })

const options: VectorizeOptions = { mode: 'monochrome', threshold: 128, colorCount: 4, smoothing: 0, cornerThreshold: 50, noise: 0, monochromeColor: '#000000' }

describe('bitmap vectorization', () => {
  it('traces a bitmap with a hole into editable combine and subtract paths', () => {
    const image = new ImageData(5, 5)
    image.data.fill(255)
    for (let y = 1; y <= 3; y += 1) for (let x = 1; x <= 3; x += 1) {
      const offset = (y * 5 + x) * 4
      image.data[offset] = image.data[offset + 1] = image.data[offset + 2] = 0
      image.data[offset + 3] = 255
    }
    const center = (2 * 5 + 2) * 4
    image.data[center] = image.data[center + 1] = image.data[center + 2] = 255

    const result = vectorizeImageData(image, options)
    expect(result).toHaveLength(1)
    expect(result[0].paths.map((path) => path.operation)).toEqual(['combine', 'subtract'])
    expect(result[0].paths.every((path) => path.knots.length >= 4)).toBe(true)
  })

  it('creates independent editable shapes for a quantized color trace', () => {
    const image = new ImageData(4, 2)
    for (let pixel = 0; pixel < 8; pixel += 1) image.data.set(pixel % 4 < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255], pixel * 4)
    const result = vectorizeImageData(image, { ...options, mode: 'color', colorCount: 2 })
    expect(result).toHaveLength(2)
    expect(new Set(result.map((shape) => shape.color))).toEqual(new Set(['#ff0000', '#0000ff']))
  })
})
