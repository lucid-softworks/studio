import { describe, expect, it } from 'vitest'
import { clipRegion, regionsToTiles, unionRegions } from './render-tiles'

describe('render tile invalidation', () => {
  it('clips dirty rectangles to document bounds', () => {
    expect(clipRegion({ x: -10, y: 20, width: 40, height: 100 }, 80, 60)).toEqual({ x: 0, y: 20, width: 30, height: 40 })
    expect(clipRegion({ x: 90, y: 0, width: 10, height: 10 }, 80, 60)).toBeNull()
  })

  it('unions batched raster edits without losing earlier regions', () => {
    expect(unionRegions([
      { x: 20, y: 30, width: 10, height: 12 },
      { x: 80, y: 10, width: 15, height: 20 },
    ])).toEqual({ x: 20, y: 10, width: 75, height: 32 })
  })

  it('expands dirty regions to unique bounded tiles', () => {
    expect(regionsToTiles([
      { x: 250, y: 250, width: 20, height: 20 },
      { x: 260, y: 260, width: 10, height: 10 },
    ], 600, 500)).toEqual([
      { x: 0, y: 0, width: 256, height: 256 },
      { x: 256, y: 0, width: 256, height: 256 },
      { x: 0, y: 256, width: 256, height: 244 },
      { x: 256, y: 256, width: 256, height: 244 },
    ])
  })
})
