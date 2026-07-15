export type RasterEdit = {
  assetId: string
  x: number
  y: number
  before: ImageData
  after: ImageData
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
