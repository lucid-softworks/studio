/// <reference lib="webworker" />

import { accumulateColorAnalysisTile, calculateColorAnalysis, calculatePrecisionColorAnalysis, createColorAnalysisAccumulator, finishColorAnalysis } from '../histogram'

declare const self: DedicatedWorkerGlobalScope

type BitmapRequest = { id: number; bitmap: ImageBitmap; maxSize: number; exact?: boolean }
type PrecisionRequest = { id: number; precision: { bitDepth: 16 | 32; width: number; height: number; data: ArrayBuffer } }

self.onmessage = (event: MessageEvent<BitmapRequest | PrecisionRequest>) => {
  if ('precision' in event.data) {
    const { id, precision } = event.data
    const data = precision.bitDepth === 16 ? new Uint16Array(precision.data) : new Float32Array(precision.data)
    self.postMessage({ id, result: calculatePrecisionColorAnalysis(data, precision.bitDepth, precision.width, precision.height) })
    return
  }

  const { bitmap, id, maxSize, exact = false } = event.data
  const scale = Math.min(1, maxSize / bitmap.width, maxSize / bitmap.height)
  const canvas = new OffscreenCanvas(exact ? bitmap.width : Math.max(1, Math.round(bitmap.width * scale)), exact ? bitmap.height : Math.max(1, Math.round(bitmap.height * scale)))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    bitmap.close()
    throw new Error('Offscreen histogram sampling is unavailable')
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  if (!exact) {
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    self.postMessage({ id, result: { ...calculateColorAnalysis(image.data, canvas.width, canvas.height), exact, precision: 8 } })
    return
  }

  const tileSize = 512
  const accumulator = createColorAnalysisAccumulator()
  for (let y = 0; y < canvas.height; y += tileSize) {
    for (let x = 0; x < canvas.width; x += tileSize) {
      const width = Math.min(tileSize, canvas.width - x)
      const height = Math.min(tileSize, canvas.height - y)
      const image = context.getImageData(x, y, width, height)
      accumulateColorAnalysisTile(accumulator, image.data, width, x, canvas.width)
    }
  }
  self.postMessage({ id, result: { ...finishColorAnalysis(accumulator), exact: true, precision: 8 } })
}

export {}
