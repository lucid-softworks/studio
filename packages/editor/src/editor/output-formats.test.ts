import { describe, expect, it } from 'vitest'
import { encodeLayeredTiff } from './output-formats'

function pixels(width: number, height: number, value: number) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(value), colorSpace: 'srgb' as PredefinedColorSpace }
}

describe('output formats', () => {
  it('writes a linked multi-page little-endian TIFF with layer names', async () => {
    const blob = encodeLayeredTiff([{ name: 'Composite', pixels: pixels(2, 1, 255) }, { name: 'Ink', pixels: pixels(2, 1, 64) }])
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const view = new DataView(bytes.buffer)
    expect(String.fromCharCode(...bytes.slice(0, 2))).toBe('II')
    expect(view.getUint16(2, true)).toBe(42)
    const firstIfd = view.getUint32(4, true)
    const nextIfd = view.getUint32(firstIfd + 2 + view.getUint16(firstIfd, true) * 12, true)
    expect(nextIfd).toBeGreaterThan(firstIfd)
    expect(new TextDecoder().decode(bytes)).toContain('Ink')
  })
})
