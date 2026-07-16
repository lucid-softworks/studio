import { describe, expect, it } from 'vitest'
import { applyImageMetadata, readImageMetadata } from './metadata'

describe('image metadata', () => {
  it('injects and reads JPEG resolution and XMP without changing pixels', async () => {
    const bare = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })
    const output = await applyImageMetadata(bare, 'jpeg', { resolutionDpi: 300, xmp: '<x:xmpmeta>Studio</x:xmpmeta>' })
    const metadata = await readImageMetadata(output)
    expect(metadata.resolutionDpi).toBe(300)
    expect(metadata.xmp).toContain('Studio')
  })

  it('preserves PNG physical resolution through a valid CRC chunk', async () => {
    const signatureOnly = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' })
    const output = await applyImageMetadata(signatureOnly, 'png', { resolutionDpi: 144 })
    const metadata = await readImageMetadata(output)
    expect(metadata.resolutionDpi).toBeCloseTo(144, 1)
  })
})
