import { describe, expect, it } from 'vitest'
import { contiguousColorMask, selectionAlphaAt } from './selection'

function selectionData(alphas: number[], width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4)
  alphas.forEach((alpha, pixel) => { data[pixel * 4 + 3] = alpha })
  return { data, width, height, colorSpace: 'srgb' } as ImageData
}

describe('selection coverage', () => {
  it('returns normalized mask alpha at document coordinates', () => {
    const data = selectionData([0, 128, 255, 64], 2, 2)
    expect(selectionAlphaAt(data, 0, 0)).toBe(0)
    expect(selectionAlphaAt(data, 1, 0)).toBeCloseTo(128 / 255)
    expect(selectionAlphaAt(data, 0, 1)).toBe(1)
  })

  it('treats pixels beyond the document as unselected', () => {
    const data = selectionData([255], 1, 1)
    expect(selectionAlphaAt(data, -1, 0)).toBe(0)
    expect(selectionAlphaAt(data, 1, 0)).toBe(0)
    expect(selectionAlphaAt(data, 0, 1)).toBe(0)
  })

  it('finds only contiguous pixels within the wand tolerance', () => {
    const image = selectionData([255, 255, 255, 255, 255, 255], 3, 2)
    const colors = [10, 12, 200, 11, 210, 205]
    colors.forEach((red, pixel) => {
      image.data[pixel * 4] = red
      image.data[pixel * 4 + 3] = 255
    })
    expect([...contiguousColorMask(image, 0, 0, 5)]).toEqual([255, 255, 0, 255, 0, 0])
  })
})
