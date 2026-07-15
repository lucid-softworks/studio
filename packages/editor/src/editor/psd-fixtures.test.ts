import { ImageData, createCanvas } from '@napi-rs/canvas'
import { initializeCanvas, readPsd, writePsd } from 'ag-psd'
import { describe, expect, it } from 'vitest'
import { psdFixtures } from './fixtures/psd-fixtures'
import { exportPsdDocument, importPsdBuffer, psdLayerNamesInEditorOrder } from './psd'
import { renderComposition } from './renderer'

initializeCanvas(
  (width, height) => createCanvas(width, height) as unknown as HTMLCanvasElement,
  (width, height) => new ImageData(width, height) as unknown as globalThis.ImageData,
)
Object.assign(globalThis, {
  ImageData,
  document: { createElement: () => createCanvas(1, 1) },
})

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

  for (const fixture of psdFixtures) {
    it(`survives ${fixture.name} import → Studio → export → import with structural and pixel parity`, async () => {
      const source = writePsd(fixture.document, { psb: fixture.psb, noBackground: true })
      const first = await importPsdBuffer(source, fixture.psb ? 'fixture.psb' : 'fixture.psd')
      const exported = await exportPsdDocument(first.document, first.assets, fixture.psb)
      const second = await importPsdBuffer(await exported.arrayBuffer(), fixture.psb ? 'roundtrip.psb' : 'roundtrip.psd')
      const structure = (value: typeof first.document) => ({
        groups: value.groups.map((group) => ({ name: group.name, parentId: group.parentId ?? null, stackOrder: group.stackOrder })),
        layers: value.layers.map((layer) => ({ name: layer.name, type: layer.type, group: value.groups.find((group) => group.id === layer.groupId)?.name ?? null, stackOrder: layer.stackOrder, opacity: layer.opacity, blendMode: layer.blendMode ?? 'normal', masked: Boolean(layer.maskAssetId), effects: Boolean(layer.effects) })),
      })
      expect(structure(second.document)).toEqual(structure(first.document))

      const render = (value: typeof first) => {
        const canvas = createCanvas(value.document.canvasSize.width, value.document.canvasSize.height) as unknown as HTMLCanvasElement
        renderComposition(canvas, value.document, value.assets)
        return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      }
      const before = render(first)
      const after = render(second)
      const difference = before.reduce((total, channel, index) => total + Math.abs(channel - after[index]), 0) / Math.max(1, before.length)
      expect(difference).toBeLessThanOrEqual(1)
    })
  }
})
