import { extractImageData } from './raster'

export type RasterTileSnapshot = {
  surface: HTMLCanvasElement
  tileSize: number
  tiles: Map<string, { x: number; y: number; image: ImageData }>
}

export function createRasterTileSnapshot(surface: HTMLCanvasElement, tileSize = 256): RasterTileSnapshot {
  return { surface, tileSize, tiles: new Map() }
}

export function captureRasterTiles(snapshot: RasterTileSnapshot, x: number, y: number, width: number, height: number) {
  const context = snapshot.surface.getContext('2d', { willReadFrequently: true })
  if (!context || width <= 0 || height <= 0) return
  const startColumn = Math.max(0, Math.floor(x / snapshot.tileSize))
  const startRow = Math.max(0, Math.floor(y / snapshot.tileSize))
  const endColumn = Math.min(Math.ceil(snapshot.surface.width / snapshot.tileSize) - 1, Math.floor((x + width - 1) / snapshot.tileSize))
  const endRow = Math.min(Math.ceil(snapshot.surface.height / snapshot.tileSize) - 1, Math.floor((y + height - 1) / snapshot.tileSize))
  for (let row = startRow; row <= endRow; row += 1) for (let column = startColumn; column <= endColumn; column += 1) {
    const key = `${column}:${row}`
    if (snapshot.tiles.has(key)) continue
    const tileX = column * snapshot.tileSize
    const tileY = row * snapshot.tileSize
    const tileWidth = Math.min(snapshot.tileSize, snapshot.surface.width - tileX)
    const tileHeight = Math.min(snapshot.tileSize, snapshot.surface.height - tileY)
    snapshot.tiles.set(key, { x: tileX, y: tileY, image: context.getImageData(tileX, tileY, tileWidth, tileHeight) })
  }
}

export function rasterSnapshotRegion(snapshot: RasterTileSnapshot, x: number, y: number, width: number, height: number) {
  const context = snapshot.surface.getContext('2d', { willReadFrequently: true })
  if (!context) return new ImageData(width, height)
  const before = context.getImageData(x, y, width, height)
  for (const tile of snapshot.tiles.values()) {
    const left = Math.max(x, tile.x)
    const top = Math.max(y, tile.y)
    const right = Math.min(x + width, tile.x + tile.image.width)
    const bottom = Math.min(y + height, tile.y + tile.image.height)
    if (right <= left || bottom <= top) continue
    const patch = extractImageData(tile.image, left - tile.x, top - tile.y, right - left, bottom - top)
    for (let row = 0; row < patch.height; row += 1) {
      const sourceStart = row * patch.width * 4
      const destinationStart = ((top - y + row) * width + left - x) * 4
      before.data.set(patch.data.subarray(sourceStart, sourceStart + patch.width * 4), destinationStart)
    }
  }
  return before
}
