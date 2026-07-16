import { ImageData } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { contentAwareResize } from './seam-carving'

Object.assign(globalThis, { ImageData })

describe('local content-aware scale', () => {
  it('removes low-energy seams before contrasting content', () => {
    const source = new ImageData(4, 2)
    for (let y = 0; y < 2; y += 1) for (let x = 0; x < 4; x += 1) {
      const offset = (y * 4 + x) * 4
      source.data.set(x === 2 ? [255, 0, 0, 255] : [20, 20, 20, 255], offset)
    }
    const output = contentAwareResize(source as unknown as globalThis.ImageData, 3, 2)
    expect(output.width).toBe(3)
    expect(Array.from({ length: 3 }, (_, x) => output.data[x * 4])).toContain(255)
  })

  it('inserts seams to enlarge both dimensions', () => {
    const source = new ImageData(Uint8ClampedArray.from([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]), 2, 2)
    const output = contentAwareResize(source as unknown as globalThis.ImageData, 3, 3)
    expect([output.width, output.height, output.data.length]).toEqual([3, 3, 36])
  })
})
