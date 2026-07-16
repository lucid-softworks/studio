/// <reference lib="webworker" />
import { applyBatchPixelActions, type ActionCommand } from '../actions'

self.onmessage = async (event: MessageEvent<{ data: ArrayBuffer; type: string; commands: ActionCommand[] }>) => {
  try {
    const { data, type, commands } = event.data
    const bitmap = await createImageBitmap(new Blob([data], { type }))
    let canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    let context = canvas.getContext('2d', { willReadFrequently: true })!
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    pixels.data.set(applyBatchPixelActions(pixels.data, commands))
    context.putImageData(pixels, 0, 0)
    for (const command of commands) {
      if (command !== 'rotate-cw' && command !== 'flip-x') continue
      const transformed = command === 'rotate-cw' ? new OffscreenCanvas(canvas.height, canvas.width) : new OffscreenCanvas(canvas.width, canvas.height)
      const next = transformed.getContext('2d')!
      if (command === 'rotate-cw') { next.translate(transformed.width, 0); next.rotate(Math.PI / 2) }
      else { next.translate(transformed.width, 0); next.scale(-1, 1) }
      next.drawImage(canvas, 0, 0)
      canvas = transformed; context = next
    }
    self.postMessage({ blob: await canvas.convertToBlob({ type: 'image/png' }) })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Batch processing failed.' })
  }
}
