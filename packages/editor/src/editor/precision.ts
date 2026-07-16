import type { SourceImage } from './runtime-assets'

function srgbToLinear(value: number) {
  const normalized = value / 255
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

export function precisionFromImageData(pixels: ImageData, bitDepth: 16 | 32, revision = 0): NonNullable<SourceImage['precision']> {
  if (bitDepth === 16) {
    const data = new Uint16Array(pixels.width * pixels.height * 4)
    for (let offset = 0; offset < data.length; offset += 4) {
      data[offset] = pixels.data[offset] * 257
      data[offset + 1] = pixels.data[offset + 1] * 257
      data[offset + 2] = pixels.data[offset + 2] * 257
      data[offset + 3] = pixels.data[offset + 3] * 257
    }
    return { bitDepth, width: pixels.width, height: pixels.height, data, revision }
  }
  const data = new Float32Array(pixels.width * pixels.height * 4)
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = srgbToLinear(pixels.data[offset])
    data[offset + 1] = srgbToLinear(pixels.data[offset + 1])
    data[offset + 2] = srgbToLinear(pixels.data[offset + 2])
    data[offset + 3] = pixels.data[offset + 3] / 255
  }
  return { bitDepth, width: pixels.width, height: pixels.height, data, revision }
}
