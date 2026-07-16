import { describe, expect, it, vi } from 'vitest'
import { writeBlobIncrementally, type BrowserWritable } from './file-save'

class MemoryWritable implements BrowserWritable {
  readonly chunks: Uint8Array[] = []
  closed = false
  aborted = false

  async write(data: Blob | BufferSource | string) {
    if (typeof data === 'string') this.chunks.push(new TextEncoder().encode(data))
    else if (data instanceof Blob) this.chunks.push(new Uint8Array(await data.arrayBuffer()))
    else if (ArrayBuffer.isView(data)) this.chunks.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice())
    else this.chunks.push(new Uint8Array(data).slice())
  }

  async close() { this.closed = true }
  async abort() { this.aborted = true }
}

describe('incremental browser saves', () => {
  it('writes a blob stream and closes the destination', async () => {
    const writable = new MemoryWritable()
    const bytes = Uint8Array.from({ length: 200_000 }, (_, index) => index % 251)

    await writeBlobIncrementally(writable, new Blob([bytes]))
    const saved = new Uint8Array(writable.chunks.reduce((total, chunk) => total + chunk.length, 0))
    let offset = 0
    for (const chunk of writable.chunks) { saved.set(chunk, offset); offset += chunk.length }

    expect(saved).toEqual(bytes)
    expect(writable.closed).toBe(true)
  })

  it('aborts a destination after a write failure', async () => {
    const writable = new MemoryWritable()
    vi.spyOn(writable, 'write').mockRejectedValueOnce(new Error('disk full'))

    await expect(writeBlobIncrementally(writable, new Blob(['pixels']))).rejects.toThrow('disk full')
    expect(writable.aborted).toBe(true)
    expect(writable.closed).toBe(false)
  })
})
