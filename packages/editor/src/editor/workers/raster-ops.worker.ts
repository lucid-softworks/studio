/// <reference lib="webworker" />
import { extractImageData, floodFillImageData } from '../raster'
import { contiguousAlphaMask, contiguousColorMask } from '../selection'

type FloodFillRequest = { id: number; operation: 'flood-fill'; data: ArrayBuffer; width: number; height: number; x: number; y: number; replacement: [number, number, number, number]; tolerance: number }
type SelectionRequest = { id: number; operation: 'contiguous-color' | 'contiguous-alpha'; data: ArrayBuffer; width: number; height: number; x: number; y: number; tolerance: number }

self.onmessage = (event: MessageEvent<FloodFillRequest | SelectionRequest>) => {
  try {
    const request = event.data
    const pixels = new Uint8ClampedArray(request.data)
    const image = new ImageData(pixels, request.width, request.height)
    if (request.operation === 'flood-fill') {
      const original = new ImageData(new Uint8ClampedArray(pixels), request.width, request.height)
      const region = floodFillImageData(image, request.x, request.y, request.replacement, request.tolerance)
      if (!region) {
        self.postMessage({ id: request.id, region: null })
        return
      }
      const before = extractImageData(original, region.x, region.y, region.width, region.height)
      const after = extractImageData(image, region.x, region.y, region.width, region.height)
      self.postMessage({ id: request.id, region, before: before.data.buffer, after: after.data.buffer }, { transfer: [before.data.buffer, after.data.buffer] })
      return
    }
    const mask = request.operation === 'contiguous-alpha'
      ? contiguousAlphaMask(image, request.x, request.y, request.tolerance)
      : contiguousColorMask(image, request.x, request.y, request.tolerance)
    self.postMessage({ id: request.id, mask: mask.buffer }, { transfer: [mask.buffer] })
  } catch (error) {
    self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : 'Raster worker failed.' })
  }
}
