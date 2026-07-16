/// <reference lib="webworker" />
import { applyColorMatrix } from '../plugins'

self.onmessage = (event: MessageEvent<{ data: ArrayBuffer; width: number; height: number; matrix: number[] }>) => {
  try {
    const { data, width, height, matrix } = event.data
    const before = new Uint8ClampedArray(data)
    if (before.length !== width * height * 4) throw new Error('The plugin filter dimensions do not match its pixels.')
    const after = applyColorMatrix(before, matrix)
    self.postMessage({ before: before.buffer, after: after.buffer }, { transfer: [before.buffer, after.buffer] })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'The plugin filter failed.' })
  }
}
