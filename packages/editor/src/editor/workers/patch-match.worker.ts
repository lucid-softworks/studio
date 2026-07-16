/// <reference lib="webworker" />
import { extractRgbaRegion, patchMatchFill, type PatchMatchRegion } from '../patch-match'

self.onmessage = (event: MessageEvent<{ data: ArrayBuffer; mask: ArrayBuffer; width: number; height: number; resultRegion: PatchMatchRegion }>) => {
  try {
    const { data, mask, width, height, resultRegion } = event.data
    const output = patchMatchFill({ data: new Uint8ClampedArray(data), mask: new Uint8Array(mask), width, height })
    const result = extractRgbaRegion(output, width, height, resultRegion)
    self.postMessage({ data: result.buffer }, { transfer: [result.buffer] })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Local PatchMatch failed.' })
  }
}
