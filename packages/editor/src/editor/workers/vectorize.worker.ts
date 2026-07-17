/// <reference lib="webworker" />
import { vectorizeImageData, type VectorizeOptions } from '../vectorize'

self.onmessage = (event: MessageEvent<{ data: ArrayBuffer; width: number; height: number; options: VectorizeOptions }>) => {
  const { data, width, height, options } = event.data
  const shapes = vectorizeImageData(new ImageData(new Uint8ClampedArray(data), width, height), options)
  self.postMessage({ shapes })
}
