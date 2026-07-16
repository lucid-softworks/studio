import { describe, expect, it } from 'vitest'
import { documentRegionToSourceRegion } from './raster-target'

describe('raster target regions', () => {
  it('maps document selection bounds into a clipped source-space region', () => {
    expect(documentRegionToSourceRegion(
      { x: 40, y: 30, width: 20, height: 10 },
      { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
      200,
      200,
    )).toEqual({ x: 80, y: 60, width: 40, height: 20 })
    expect(documentRegionToSourceRegion(
      { x: -20, y: -20, width: 30, height: 30 },
      { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
      200,
      200,
    )).toEqual({ x: 0, y: 0, width: 20, height: 20 })
  })

  it('bounds rotated selections by all four inverse-transformed corners', () => {
    const region = documentRegionToSourceRegion(
      { x: 40, y: 40, width: 20, height: 20 },
      { x: 0, y: 0, width: 100, height: 100, rotation: 45 },
      100,
      100,
    )
    expect(region).toEqual({ x: 35, y: 35, width: 30, height: 30 })
  })
})
