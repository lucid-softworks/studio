import { ImageData } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { applyPixelFilterGraph, createFilterGraphNode, normalizeFilterGraph } from './filter-graph'

Object.assign(globalThis, { ImageData })

describe('filter graph', () => {
  it('normalizes reusable nodes', () => {
    expect(normalizeFilterGraph([{ ...createFilterGraphNode('pixelate', 'mosaic'), size: 999 }])[0].size).toBe(256)
  })

  it('executes deterministic pixelate and noise nodes locally', () => {
    const source = new ImageData(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]), 2, 1)
    const result = applyPixelFilterGraph(source as unknown as globalThis.ImageData, [{ ...createFilterGraphNode('noise', 'noise'), amount: 20, seed: 12 }])
    expect([...result.data]).not.toEqual([...source.data])
    expect(result.data[3]).toBe(255)
  })

  it('keeps procedural filters stable inside a bounded document region', () => {
    const source = new ImageData(new Uint8ClampedArray(4 * 4 * 4).fill(128), 4, 4)
    for (let offset = 3; offset < source.data.length; offset += 4) source.data[offset] = 255
    const node = { ...createFilterGraphNode('noise', 'noise'), amount: 35, seed: 17 }
    const full = applyPixelFilterGraph(source as unknown as globalThis.ImageData, [node])
    const boundedSource = new ImageData(2, 2)
    for (let row = 0; row < 2; row += 1) {
      const start = ((row + 1) * 4 + 1) * 4
      boundedSource.data.set(source.data.subarray(start, start + 8), row * 8)
    }
    const bounded = applyPixelFilterGraph(boundedSource as unknown as globalThis.ImageData, [node], { x: 1, y: 1 })
    for (let row = 0; row < 2; row += 1) {
      const start = ((row + 1) * 4 + 1) * 4
      expect([...bounded.data.subarray(row * 8, row * 8 + 8)]).toEqual([...full.data.subarray(start, start + 8)])
    }
  })
})
