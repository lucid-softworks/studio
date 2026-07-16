import { createCanvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { applySelectionShape, contiguousAlphaMask, contiguousColorMask, selectionAlphaAt, selectionAlphaAtPoint } from './selection'

Object.assign(globalThis, { document: { createElement: () => createCanvas(1, 1) } })

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

  it('stores sparse pixel coverage in addressable tiles', () => {
    const selection = applySelectionShape(null, { kind: 'rectangle', x: 300, y: 20, width: 10, height: 8 }, 'replace', 1024, 1024)
    expect(selection.tiles.size).toBe(1)
    expect([...selection.tiles.keys()]).toEqual(['1:0'])
    expect(selectionAlphaAtPoint(selection, 305, 24)).toBe(1)
    expect(selectionAlphaAtPoint(selection, 10, 10)).toBe(0)
    expect(selection.bounds).toEqual({ x: 300, y: 20, width: 10, height: 8 })
  })

  it('finds a connected non-transparent object without selecting its neighbour', () => {
    const image = selectionData([255, 255, 0, 255, 255], 5, 1)
    expect([...contiguousAlphaMask(image, 0, 0)]).toEqual([255, 255, 0, 0, 0])
  })

  it('combines tiled selections with add, subtract, and intersect modes', () => {
    let selection = applySelectionShape(null, { kind: 'rectangle', x: 0, y: 0, width: 4, height: 1 }, 'replace', 8, 1)
    selection = applySelectionShape(selection, { kind: 'rectangle', x: 4, y: 0, width: 4, height: 1 }, 'add', 8, 1)
    selection = applySelectionShape(selection, { kind: 'rectangle', x: 2, y: 0, width: 2, height: 1 }, 'subtract', 8, 1)
    expect(Array.from({ length: 8 }, (_, x) => selectionAlphaAtPoint(selection, x, 0))).toEqual([1, 1, 0, 0, 1, 1, 1, 1])
    selection = applySelectionShape(selection, { kind: 'rectangle', x: 1, y: 0, width: 5, height: 1 }, 'intersect', 8, 1)
    expect(Array.from({ length: 8 }, (_, x) => selectionAlphaAtPoint(selection, x, 0))).toEqual([0, 1, 0, 0, 1, 1, 0, 0])
  })
})
