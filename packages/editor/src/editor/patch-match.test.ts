import { describe, expect, it } from 'vitest'
import { extractRgbaRegion, patchMatchFill } from './patch-match'

describe('local PatchMatch fill', () => {
  it('fills selected pixels from matching known texture', () => {
    const width = 8
    const height = 8
    const data = new Uint8ClampedArray(width * height * 4)
    for (let pixel = 0; pixel < width * height; pixel += 1) data.set(pixel % 2 ? [220, 30, 40, 255] : [20, 200, 80, 255], pixel * 4)
    const mask = new Uint8Array(width * height)
    mask[3 * width + 3] = 1
    data.fill(0, (3 * width + 3) * 4, (3 * width + 3) * 4 + 4)
    const output = patchMatchFill({ data, mask, width, height, iterations: 3 })
    expect(output[(3 * width + 3) * 4 + 3]).toBe(255)
    expect(output[(3 * width + 3) * 4]).toBeGreaterThan(0)
  })

  it('rejects a selection covering every pixel', () => {
    expect(() => patchMatchFill({ data: new Uint8ClampedArray(16), mask: new Uint8Array([1, 1, 1, 1]), width: 2, height: 2 })).toThrow(/outside/)
  })

  it('returns only the requested dirty result region', () => {
    const data = new Uint8ClampedArray(4 * 3 * 4)
    for (let pixel = 0; pixel < 12; pixel += 1) data.set([pixel, pixel + 1, pixel + 2, 255], pixel * 4)
    expect([...extractRgbaRegion(data, 4, 3, { x: 1, y: 1, width: 2, height: 2 })]).toEqual([
      5, 6, 7, 255, 6, 7, 8, 255,
      9, 10, 11, 255, 10, 11, 12, 255,
    ])
    expect(() => extractRgbaRegion(data, 4, 3, { x: 3, y: 2, width: 2, height: 1 })).toThrow(/outside/)
  })
})
