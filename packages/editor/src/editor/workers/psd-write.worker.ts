/// <reference lib="webworker" />
import type { Psd } from 'ag-psd'
import psdWriter from 'ag-psd/dist/psdWriter'

const { createSegmentedWriter, getWriterSegments, writePsd } = psdWriter

self.onmessage = (event: MessageEvent<{ psd: Psd; psb: boolean }>) => {
  try {
    const writer = createSegmentedWriter()
    writePsd(writer, event.data.psd, { psb: event.data.psb, noBackground: true })
    const segments = getWriterSegments(writer)
    self.postMessage({ segments }, segments.map((segment) => segment.buffer))
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'PSD encoding failed.' })
  }
}
