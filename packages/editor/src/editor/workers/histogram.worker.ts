/// <reference lib="webworker" />

import { calculateHistogram } from '../histogram'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (event: MessageEvent<{ id: number; data: ArrayBuffer }>) => {
  self.postMessage({ id: event.data.id, result: calculateHistogram(new Uint8ClampedArray(event.data.data)) })
}

export {}
