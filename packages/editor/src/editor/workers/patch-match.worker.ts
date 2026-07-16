/// <reference lib="webworker" />
import { patchMatchFill } from '../patch-match'

self.onmessage = (event: MessageEvent<{ data: ArrayBuffer; mask: ArrayBuffer; width: number; height: number }>) => {
  try {
    const { data, mask, width, height } = event.data
    const output = patchMatchFill({ data: new Uint8ClampedArray(data), mask: new Uint8Array(mask), width, height })
    self.postMessage({ data: output.buffer }, { transfer: [output.buffer] })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Local PatchMatch failed.' })
  }
}
