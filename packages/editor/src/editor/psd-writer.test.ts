import { describe, expect, it } from 'vitest'
import { readPsd, writePsdSegments, writePsdUint8Array, type Psd } from 'ag-psd'

function patternedDocument(width: number, height: number): Psd {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4
    data[offset] = pixel % 251
    data[offset + 1] = (pixel * 7) % 253
    data[offset + 2] = (pixel * 13) % 255
    data[offset + 3] = 255
  }
  return { width, height, imageData: { width, height, data }, children: [] }
}

describe('segmented PSD writer', () => {
  it('matches the contiguous writer across segment boundaries and remains readable', () => {
    const document = patternedDocument(256, 192)
    const options = { noBackground: true }
    const contiguous = writePsdUint8Array(document, options)
    const segments = writePsdSegments(document, options, 4096)
    const combined = new Uint8Array(segments.reduce((total, segment) => total + segment.byteLength, 0))
    let offset = 0
    for (const segment of segments) {
      combined.set(segment, offset)
      offset += segment.byteLength
    }

    expect(segments.length).toBeGreaterThan(1)
    expect(combined).toEqual(contiguous)
    expect(readPsd(combined, { skipCompositeImageData: true, skipLayerImageData: true })).toMatchObject({ width: 256, height: 192 })
  })
})
