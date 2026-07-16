import { createCanvas, ImageData } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { parseAbrBuffer } from './abr'

Object.assign(globalThis, { ImageData, document: { createElement: () => createCanvas(1, 1) } })

function legacySampledAbr() {
  const width = 2
  const height = 2
  const dataSize = 4 + 2 + 1 + 8 + 16 + 2 + 2 + width * height
  const buffer = new ArrayBuffer(4 + 2 + 4 + dataSize)
  const view = new DataView(buffer)
  let offset = 0
  view.setUint16(offset, 1); offset += 2
  view.setUint16(offset, 1); offset += 2
  view.setUint16(offset, 2); offset += 2
  view.setUint32(offset, dataSize); offset += 4
  view.setUint32(offset, 0); offset += 4
  view.setUint16(offset, 25); offset += 2
  view.setUint8(offset, 1); offset += 1
  for (const value of [0, 0, height, width]) { view.setInt16(offset, value); offset += 2 }
  for (const value of [0, 0, height, width]) { view.setInt32(offset, value); offset += 4 }
  view.setUint16(offset, 8); offset += 2
  view.setUint16(offset, 0); offset += 2
  new Uint8Array(buffer, offset).set([0, 64, 128, 255])
  return buffer
}

function modernSampledAbr() {
  const width = 2
  const height = 2
  const brushSize = 37 + 10 + 16 + 2 + 1 + width * height
  const paddedBrushSize = brushSize + ((4 - brushSize % 4) % 4)
  const sectionSize = 4 + paddedBrushSize
  const buffer = new ArrayBuffer(4 + 12 + sectionSize)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let offset = 0
  view.setUint16(offset, 6); offset += 2
  view.setUint16(offset, 1); offset += 2
  bytes.set(new TextEncoder().encode('8BIMsamp'), offset); offset += 8
  view.setUint32(offset, sectionSize); offset += 4
  view.setUint32(offset, brushSize); offset += 4
  offset += 37 + 10
  for (const value of [0, 0, height, width]) { view.setInt32(offset, value); offset += 4 }
  view.setUint16(offset, 8); offset += 2
  view.setUint8(offset, 0); offset += 1
  bytes.set([0, 64, 128, 255], offset)
  return buffer
}

describe('ABR import', () => {
  it('decodes documented legacy sampled brush tips', () => {
    const brushes = parseAbrBuffer(legacySampledAbr())
    expect(brushes).toHaveLength(1)
    expect(brushes[0]).toMatchObject({ name: 'ABR Brush 1', spacing: 25 })
    expect(brushes[0].tip).toMatchObject({ width: 2, height: 2 })
  })

  it('decodes version-6 sampled-tip sections', () => {
    const brushes = parseAbrBuffer(modernSampledAbr())
    expect(brushes).toHaveLength(1)
    expect(brushes[0]).toMatchObject({ name: 'ABR Brush 1', spacing: 18 })
    expect(brushes[0].tip).toMatchObject({ width: 2, height: 2 })
  })
})
