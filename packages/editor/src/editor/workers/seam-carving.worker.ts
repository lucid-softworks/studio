/// <reference lib="webworker" />
import { contentAwareResize } from '../seam-carving'

self.onmessage = (event: MessageEvent<{ data: ArrayBuffer; width: number; height: number; targetWidth: number; targetHeight: number }>) => {
  const { data, width, height, targetWidth, targetHeight } = event.data
  const output = contentAwareResize(new ImageData(new Uint8ClampedArray(data), width, height), targetWidth, targetHeight)
  self.postMessage({ data: output.data.buffer, width: output.width, height: output.height }, { transfer: [output.data.buffer] })
}
