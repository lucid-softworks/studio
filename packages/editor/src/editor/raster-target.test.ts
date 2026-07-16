import { describe, expect, it } from 'vitest'
import { canvasToSource, documentRegionToSourceRegion, geometryDestinationToSource, geometrySourceToDestination, sourceToCanvas, type RasterTarget } from './raster-target'
import type { LayerGeometryTransform, RasterLayer } from './types'

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

describe('warped raster coordinates', () => {
  const transform: LayerGeometryTransform = {
    skewX: 0,
    skewY: 0,
    perspectiveX: 0,
    perspectiveY: 0,
    corners: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
    interpolation: 'bicubic',
    referencePoint: { x: 0.5, y: 0.5 },
    warp: {
      columns: 3,
      rows: 3,
      points: [
        { x: -0.05, y: 0.02 }, { x: 0.5, y: -0.08 }, { x: 1.04, y: 0.03 },
        { x: -0.02, y: 0.5 }, { x: 0.58, y: 0.44 }, { x: 1.02, y: 0.55 },
        { x: 0.03, y: 1.02 }, { x: 0.48, y: 1.08 }, { x: 0.96, y: 0.97 },
      ],
    },
  }

  it('maps every mesh vertex in both directions', () => {
    transform.warp!.points.forEach((destination, index) => {
      const source = { x: index % 3 / 2, y: Math.floor(index / 3) / 2 }
      expect(geometrySourceToDestination(source, transform).x).toBeCloseTo(destination.x, 6)
      expect(geometrySourceToDestination(source, transform).y).toBeCloseTo(destination.y, 6)
      expect(geometryDestinationToSource(destination, transform).x).toBeCloseTo(source.x, 6)
      expect(geometryDestinationToSource(destination, transform).y).toBeCloseTo(source.y, 6)
    })
  })

  it('round-trips points across every mesh triangle', () => {
    for (const source of [{ x: 0.15, y: 0.1 }, { x: 0.42, y: 0.3 }, { x: 0.7, y: 0.2 }, { x: 0.2, y: 0.72 }, { x: 0.58, y: 0.66 }, { x: 0.88, y: 0.84 }]) {
      const destination = geometrySourceToDestination(source, transform)
      const restored = geometryDestinationToSource(destination, transform)
      expect(restored.x).toBeCloseTo(source.x, 6)
      expect(restored.y).toBeCloseTo(source.y, 6)
    }
  })

  it('maps painting coordinates through perspective, rotation, and layer flips', () => {
    const layer: RasterLayer = {
      id: 'paint', type: 'raster', name: 'Paint', visible: true, locked: false, opacity: 100,
      position: { x: 0, y: 0 }, rotation: 17, assetId: 'pixels', width: 200, height: 100, scale: 100,
      flipX: true, flipY: true,
      geometryTransform: {
        skewX: 4, skewY: -3, perspectiveX: 70, perspectiveY: -45,
        corners: [{ x: -0.08, y: 0.03 }, { x: 0.04, y: -0.05 }, { x: 0.08, y: 0.07 }, { x: -0.03, y: 0.02 }],
        interpolation: 'bicubic', referencePoint: { x: 0.5, y: 0.5 },
      },
    }
    const target: RasterTarget = {
      layer,
      surface: { width: 200, height: 100 } as HTMLCanvasElement,
      bounds: { x: 300, y: 200, width: 200, height: 100, rotation: layer.rotation },
      locked: false,
    }

    for (const source of [{ x: 20, y: 15 }, { x: 85, y: 40 }, { x: 160, y: 75 }]) {
      const displayed = sourceToCanvas(source, target)
      const restored = canvasToSource(displayed, target)
      expect(restored.x).toBeCloseTo(source.x, 6)
      expect(restored.y).toBeCloseTo(source.y, 6)
    }
  })
})
