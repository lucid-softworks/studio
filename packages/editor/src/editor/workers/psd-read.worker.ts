/// <reference lib="webworker" />
import { initializeCanvas, readPsd, type Psd } from 'ag-psd'

initializeCanvas(
  (width, height) => new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement,
  (width, height) => new ImageData(width, height),
)

function transferables(value: unknown, buffers = new Set<ArrayBuffer>(), seen = new WeakSet<object>()) {
  if (value instanceof ArrayBuffer) buffers.add(value)
  else if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) buffers.add(value.buffer)
  else if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value)
    for (const entry of Object.values(value)) transferables(entry, buffers, seen)
  }
  return buffers
}

self.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer }>) => {
  const { buffer } = event.data
  try {
    const psd: Psd = readPsd(buffer, { skipThumbnail: true, useImageData: true })
    const buffers = transferables(psd)
    buffers.add(buffer)
    self.postMessage({ psd, buffer }, [...buffers])
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'PSD decoding failed.', buffer }, [buffer])
  }
}
