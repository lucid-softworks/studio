/// <reference lib="webworker" />
import { encodeApng, encodeAvif, encodeGif, encodeLayeredTiff, encodePdf, encodePrintPdf, type RasterExportFrame } from '../output-formats'

type ExportRequest = {
  format: 'tiff' | 'pdf' | 'gif' | 'apng' | 'avif' | 'print-pdf'
  frames: RasterExportFrame[]
  dpi?: number
  metadata?: { author?: string; description?: string; title?: string }
  settings?: { widthInches: number; heightInches: number; bleedInches: number; cropMarks: boolean }
}

self.onmessage = async (event: MessageEvent<ExportRequest>) => {
  try {
    const { format, frames, metadata } = event.data
    if (!frames.length) throw new Error('The export has no raster frames.')
    const blob = format === 'tiff' ? encodeLayeredTiff(frames, event.data.dpi)
      : format === 'pdf' ? await encodePdf(frames[0], event.data.dpi, metadata)
        : format === 'gif' ? await encodeGif(frames)
          : format === 'apng' ? await encodeApng(frames)
            : format === 'avif' ? await encodeAvif(frames[0])
              : event.data.settings ? await encodePrintPdf(frames[0], event.data.settings, metadata) : null
    if (!blob) throw new Error('The export settings are incomplete.')
    self.postMessage({ blob })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Raster export failed.' })
  }
}
