import type { RasterRegion } from '../raster'

export const DEFAULT_RENDER_TILE_SIZE = 256

export function clipRegion(region: RasterRegion, width: number, height: number): RasterRegion | null {
  const x = Math.max(0, Math.floor(region.x))
  const y = Math.max(0, Math.floor(region.y))
  const right = Math.min(width, Math.ceil(region.x + region.width))
  const bottom = Math.min(height, Math.ceil(region.y + region.height))
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

export function unionRegions(regions: readonly RasterRegion[]): RasterRegion | null {
  if (regions.length === 0) return null
  const left = Math.min(...regions.map((region) => region.x))
  const top = Math.min(...regions.map((region) => region.y))
  const right = Math.max(...regions.map((region) => region.x + region.width))
  const bottom = Math.max(...regions.map((region) => region.y + region.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function regionsToTiles(
  regions: readonly RasterRegion[],
  width: number,
  height: number,
  tileSize = DEFAULT_RENDER_TILE_SIZE,
): RasterRegion[] {
  const tiles = new Map<string, RasterRegion>()
  for (const input of regions) {
    const region = clipRegion(input, width, height)
    if (!region) continue
    const startX = Math.floor(region.x / tileSize)
    const startY = Math.floor(region.y / tileSize)
    const endX = Math.floor((region.x + region.width - 1) / tileSize)
    const endY = Math.floor((region.y + region.height - 1) / tileSize)
    for (let tileY = startY; tileY <= endY; tileY += 1) {
      for (let tileX = startX; tileX <= endX; tileX += 1) {
        const x = tileX * tileSize
        const y = tileY * tileSize
        tiles.set(`${tileX}:${tileY}`, {
          x,
          y,
          width: Math.min(tileSize, width - x),
          height: Math.min(tileSize, height - y),
        })
      }
    }
  }
  return [...tiles.values()]
}
