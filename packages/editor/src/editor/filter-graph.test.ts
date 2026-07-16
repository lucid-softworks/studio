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
})
