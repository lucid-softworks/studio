/// <reference lib="webworker" />
import { extractImageData, floodFillImageData } from '../raster'
import { contiguousAlphaMask, contiguousColorMask } from '../selection'
import { generateLinearGradient, type GradientSelectionConstraint } from '../raster-worker-ops'

type FloodFillRequest = { id: number; operation: 'flood-fill'; data: ArrayBuffer; width: number; height: number; x: number; y: number; replacement: [number, number, number, number]; tolerance: number }
type SelectionRequest = { id: number; operation: 'contiguous-color' | 'contiguous-alpha'; data: ArrayBuffer; width: number; height: number; x: number; y: number; tolerance: number }
type GradientRequest = { id: number; operation: 'gradient'; data: ArrayBuffer; width: number; height: number; start: { x: number; y: number }; end: { x: number; y: number }; stops: Array<{ position: number; color: [number, number, number, number] }>; selection?: GradientSelectionConstraint }

function progress(id: number, value: number) {
  self.postMessage({ id, progress: Math.max(0, Math.min(1, value)) })
}

self.onmessage = (event: MessageEvent<FloodFillRequest | SelectionRequest | GradientRequest>) => {
  try {
    const request = event.data
    progress(request.id, 0)
    if (request.operation === 'gradient') {
      const after = generateLinearGradient(request, (value) => progress(request.id, value))
      self.postMessage({ id: request.id, before: request.data, after: after.buffer }, { transfer: [request.data, after.buffer] })
      return
    }
    const pixels = new Uint8ClampedArray(request.data)
    const image = new ImageData(pixels, request.width, request.height)
    if (request.operation === 'flood-fill') {
      const original = new ImageData(new Uint8ClampedArray(pixels), request.width, request.height)
      const region = floodFillImageData(image, request.x, request.y, request.replacement, request.tolerance, (value) => progress(request.id, value))
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
      ? contiguousAlphaMask(image, request.x, request.y, request.tolerance, (value) => progress(request.id, value))
      : contiguousColorMask(image, request.x, request.y, request.tolerance, (value) => progress(request.id, value))
    progress(request.id, 1)
    self.postMessage({ id: request.id, mask: mask.buffer }, { transfer: [mask.buffer] })
  } catch (error) {
    self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : 'Raster worker failed.' })
  }
}
