/// <reference lib="webworker" />

import { calculateHistogram } from '../histogram'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (event: MessageEvent<{ id: number; bitmap: ImageBitmap; maxSize: number }>) => {
  const { bitmap, id, maxSize } = event.data
  const scale = Math.min(1, maxSize / bitmap.width, maxSize / bitmap.height)
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(bitmap.width * scale)),
    Math.max(1, Math.round(bitmap.height * scale)),
  )
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    bitmap.close()
    throw new Error('Offscreen histogram sampling is unavailable')
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  self.postMessage({ id, result: calculateHistogram(image.data) })
}

export {}
