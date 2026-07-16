import { createCanvas } from '@napi-rs/canvas'
import { describe, expect, it, vi } from 'vitest'
import { applySelectionShape, colorRangeMask, componentChannelMask, contiguousAlphaMask, contiguousColorMask, edgeSelectionMask, growSelectionMask, luminosityRangeMask, refineSelection, selectionAlphaAt, selectionAlphaAtPoint, similarSelectionMask } from './selection'

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

  it('reports completion for worker-driven wand and object masks', () => {
    const image = selectionData([255, 255], 2, 1)
    const colorProgress = vi.fn()
    const alphaProgress = vi.fn()
    contiguousColorMask(image, 0, 0, 0, colorProgress)
    contiguousAlphaMask(image, 0, 0, 0, alphaProgress)
    expect(colorProgress).toHaveBeenLastCalledWith(1)
    expect(alphaProgress).toHaveBeenLastCalledWith(1)
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

  it('builds global color, luminosity, and local edge masks', () => {
    const image = selectionData([255, 255, 255], 3, 1)
    ;[10, 80, 220].forEach((value, pixel) => { image.data[pixel * 4] = image.data[pixel * 4 + 1] = image.data[pixel * 4 + 2] = value })
    expect([...colorRangeMask(image, [10, 10, 10], 20)]).toEqual([255, 0, 0])
    expect([...luminosityRangeMask(image, 70, 100, 0)]).toEqual([0, 255, 0])
    expect(edgeSelectionMask(image, 20).some((value) => value > 0)).toBe(true)
  })

  it('extracts additive and subtractive component channels', () => {
    const image = selectionData([255], 1, 1)
    image.data.set([40, 100, 220, 255])
    expect([...componentChannelMask(image, 'red')]).toEqual([40])
    expect([...componentChannelMask(image, 'green')]).toEqual([100])
    expect([...componentChannelMask(image, 'blue')]).toEqual([220])
    expect([...componentChannelMask(image, 'cyan')]).toEqual([215])
    expect([...componentChannelMask(image, 'magenta')]).toEqual([155])
    expect([...componentChannelMask(image, 'yellow')]).toEqual([35])
    expect([...componentChannelMask(image, 'black')]).toEqual([35])
  })

  it('grows adjacent matching pixels and finds similar pixels globally', () => {
    const image = selectionData([255, 255, 255, 255], 4, 1)
    ;[20, 22, 200, 21].forEach((value, pixel) => { image.data[pixel * 4] = value })
    const selection = applySelectionShape(null, { kind: 'rectangle', x: 0, y: 0, width: 1, height: 1 }, 'replace', 4, 1)
    expect([...growSelectionMask(selection, image, 5)]).toEqual([255, 255, 0, 0])
    expect([...similarSelectionMask(selection, image, 5)]).toEqual([255, 170, 0, 213])
  })

  it('refines a cloned selection without mutating the source mask', () => {
    const source = applySelectionShape(null, { kind: 'rectangle', x: 2, y: 0, width: 2, height: 1 }, 'replace', 6, 1)
    const refined = refineSelection(source, { radius: 1, feather: 0, contrast: 0, shiftEdge: 0, decontamination: 0 })
    expect(source.bounds).toEqual({ x: 2, y: 0, width: 2, height: 1 })
    expect(refined.bounds).toEqual({ x: 1, y: 0, width: 4, height: 1 })
  })
})
