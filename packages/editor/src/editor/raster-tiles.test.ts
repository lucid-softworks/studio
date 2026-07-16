import { createCanvas, ImageData } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { captureRasterTiles, createRasterTileSnapshot, rasterSnapshotRegion } from './raster-tiles'

Object.assign(globalThis, { ImageData })

describe('tiled raster stroke snapshots', () => {
  it('captures only touched tiles and reconstructs the pre-stroke region', () => {
    const surface = createCanvas(600, 600) as unknown as HTMLCanvasElement
    const context = surface.getContext('2d')!
    context.fillStyle = '#ff0000'
    context.fillRect(0, 0, 600, 600)
    const snapshot = createRasterTileSnapshot(surface, 256)
    captureRasterTiles(snapshot, 270, 20, 20, 20)
    expect(snapshot.tiles.size).toBe(1)
    context.fillStyle = '#0000ff'
    context.fillRect(270, 20, 20, 20)
    const before = rasterSnapshotRegion(snapshot, 270, 20, 20, 20)
    expect(Array.from(before.data.slice(0, 4))).toEqual([255, 0, 0, 255])
  })
})
