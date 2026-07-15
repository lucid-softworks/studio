import { ImageData, createCanvas } from '@napi-rs/canvas'
import { initializeCanvas, readPsd, writePsd } from 'ag-psd'
import { describe, expect, it } from 'vitest'
import { psdFixtures } from './fixtures/psd-fixtures'
import { psdLayerNamesInEditorOrder } from './psd'

initializeCanvas(
  (width, height) => createCanvas(width, height) as unknown as HTMLCanvasElement,
  (width, height) => new ImageData(width, height) as unknown as globalThis.ImageData,
)

function pixelChecksum(data: ArrayLike<number>) {
  let hash = 2166136261
  for (let index = 0; index < data.length; index += 1) {
    hash ^= data[index]
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

describe('legal PSD and PSB fixture corpus', () => {
  for (const fixture of psdFixtures) {
    it(`round-trips ${fixture.name} structurally and pixel-identically`, () => {
      const encoded = writePsd(fixture.document, { psb: fixture.psb, noBackground: true })
      const header = new Uint8Array(encoded, 0, 6)
      const decoded = readPsd(encoded, { useImageData: true, skipThumbnail: true })

      expect(new TextDecoder().decode(header.subarray(0, 4))).toBe('8BPS')
      expect(new DataView(encoded).getUint16(4)).toBe(fixture.psb ? 2 : 1)
      expect(decoded.width).toBe(fixture.document.width)
      expect(decoded.height).toBe(fixture.document.height)
      expect(psdLayerNamesInEditorOrder(decoded.children ?? [])).toEqual(fixture.editorOrder)
      expect(pixelChecksum(decoded.imageData?.data ?? [])).toBe(pixelChecksum(fixture.document.imageData?.data ?? []))
    })
  }
})
