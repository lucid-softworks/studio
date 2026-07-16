export type RasterEdit = {
  assetId: string
  x: number
  y: number
  before: ImageData
  after: ImageData
}

export type RasterRegion = { x: number; y: number; width: number; height: number }

export function hexToRgba(hex: string, alpha = 255): [number, number, number, number] {
  const value = hex.replace('#', '')
  const expanded = value.length === 3 ? value.split('').map((part) => `${part}${part}`).join('') : value
  const parsed = Number.parseInt(expanded, 16)
  if (!Number.isFinite(parsed) || expanded.length !== 6) return [0, 0, 0, alpha]
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255, alpha]
}

export function floodFillImageData(image: ImageData, startX: number, startY: number, replacement: [number, number, number, number], tolerance: number, onProgress?: (progress: number) => void): RasterRegion | null {
  const width = image.width
  const height = image.height
  const x = Math.max(0, Math.min(width - 1, Math.floor(startX)))
  const y = Math.max(0, Math.min(height - 1, Math.floor(startY)))
  const startOffset = (y * width + x) * 4
  const target = [image.data[startOffset], image.data[startOffset + 1], image.data[startOffset + 2], image.data[startOffset + 3]]
  if (target.every((value, channel) => value === replacement[channel])) return null
  const threshold = Math.max(0, Math.min(255, tolerance))
  const visited = new Uint8Array(width * height)
  const stack = [y * width + x]
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  let visitedCount = 0

  while (stack.length) {
    const pixel = stack.pop()!
    if (visited[pixel]) continue
    visited[pixel] = 1
    visitedCount += 1
    if (visitedCount % 65_536 === 0) onProgress?.(visitedCount / visited.length)
    const offset = pixel * 4
    const distance = Math.max(
      Math.abs(image.data[offset] - target[0]),
      Math.abs(image.data[offset + 1] - target[1]),
      Math.abs(image.data[offset + 2] - target[2]),
      Math.abs(image.data[offset + 3] - target[3]),
    )
    if (distance > threshold) continue
    image.data.set(replacement, offset)
    const pixelX = pixel % width
    const pixelY = Math.floor(pixel / width)
    left = Math.min(left, pixelX)
    top = Math.min(top, pixelY)
    right = Math.max(right, pixelX)
    bottom = Math.max(bottom, pixelY)
    if (pixelX > 0) stack.push(pixel - 1)
    if (pixelX + 1 < width) stack.push(pixel + 1)
    if (pixelY > 0) stack.push(pixel - width)
    if (pixelY + 1 < height) stack.push(pixel + width)
  }

  onProgress?.(1)
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

export function extractImageData(source: ImageData, x: number, y: number, width: number, height: number) {
  const result = new ImageData(width, height)
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((y + row) * source.width + x) * 4
    const targetStart = row * width * 4
    result.data.set(source.data.subarray(sourceStart, sourceStart + width * 4), targetStart)
  }
  return result
}
