/// <reference lib="webworker" />
import { extractImageData, floodFillImageData } from '../raster'
import { contiguousAlphaMask, contiguousColorMask } from '../selection'

type FloodFillRequest = { id: number; operation: 'flood-fill'; data: ArrayBuffer; width: number; height: number; x: number; y: number; replacement: [number, number, number, number]; tolerance: number }
type SelectionRequest = { id: number; operation: 'contiguous-color' | 'contiguous-alpha'; data: ArrayBuffer; width: number; height: number; x: number; y: number; tolerance: number }
type GradientRequest = { id: number; operation: 'gradient'; data: ArrayBuffer; width: number; height: number; start: { x: number; y: number }; end: { x: number; y: number }; stops: Array<{ position: number; color: [number, number, number, number] }> }

self.onmessage = (event: MessageEvent<FloodFillRequest | SelectionRequest | GradientRequest>) => {
  try {
    const request = event.data
    if (request.operation === 'gradient') {
      const after = new Uint8ClampedArray(request.width * request.height * 4)
      const dx = request.end.x - request.start.x
      const dy = request.end.y - request.start.y
      const lengthSquared = Math.max(1, dx * dx + dy * dy)
      for (let y = 0; y < request.height; y += 1) for (let x = 0; x < request.width; x += 1) {
        const position = Math.max(0, Math.min(1, ((x - request.start.x) * dx + (y - request.start.y) * dy) / lengthSquared)) * 100
        const rightIndex = Math.max(1, request.stops.findIndex((stop) => stop.position >= position))
        const leftStop = request.stops[rightIndex - 1]
        const rightStop = request.stops[rightIndex] ?? request.stops.at(-1)!
        const amount = Math.max(0, Math.min(1, (position - leftStop.position) / Math.max(0.001, rightStop.position - leftStop.position)))
        const offset = (y * request.width + x) * 4
        for (let channel = 0; channel < 4; channel += 1) after[offset + channel] = Math.round(leftStop.color[channel] + (rightStop.color[channel] - leftStop.color[channel]) * amount)
      }
      self.postMessage({ id: request.id, before: request.data, after: after.buffer }, { transfer: [request.data, after.buffer] })
      return
    }
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
