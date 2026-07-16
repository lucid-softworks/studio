export type RasterExportFrame = { name: string; pixels: ImageData; delayMs?: number }
type GifPalette = number[][]
type GifEncoder = { writeFrame(index: Uint8Array, width: number, height: number, options: { palette?: GifPalette; delay?: number; repeat?: number; transparent?: boolean; transparentIndex?: number }): void; finish(): void; bytes(): Uint8Array }
type GifModule = { GIFEncoder(): GifEncoder; quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: string; oneBitAlpha?: boolean }): GifPalette; applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: GifPalette, format?: string): Uint8Array }

function writeAscii(target: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) target[offset + index] = value.charCodeAt(index) & 0xff
  target[offset + value.length] = 0
}

async function pixelsToPng(pixels: ImageData, errorMessage: string) {
  if (typeof OffscreenCanvas !== 'undefined') {
    const surface = new OffscreenCanvas(pixels.width, pixels.height)
    surface.getContext('2d')?.putImageData(pixels, 0, 0)
    return surface.convertToBlob({ type: 'image/png' })
  }
  const surface = document.createElement('canvas')
  surface.width = pixels.width
  surface.height = pixels.height
  surface.getContext('2d')?.putImageData(pixels, 0, 0)
  return new Promise<Blob>((resolve, reject) => surface.toBlob((blob) => blob ? resolve(blob) : reject(new Error(errorMessage)), 'image/png'))
}

export function encodeLayeredTiff(frames: RasterExportFrame[], dpi = 72) {
  if (!frames.length) throw new Error('A TIFF needs at least one image layer.')
  const descriptions = frames.map((frame) => `${frame.name}\0`)
  const ifdEntryCount = 14
  const ifdBytes = 2 + ifdEntryCount * 12 + 4
  const blocks = frames.map((frame, index) => {
    const descriptionBytes = descriptions[index].length
    const extras = 8 + 8 + 8 + descriptionBytes + (descriptionBytes % 2)
    return { offset: 0, bytes: ifdBytes + extras + frame.pixels.data.byteLength }
  })
  let total = 8
  for (const block of blocks) { block.offset = total; total += block.bytes }
  const bytes = new Uint8Array(total)
  const view = new DataView(bytes.buffer)
  bytes[0] = 0x49; bytes[1] = 0x49
  view.setUint16(2, 42, true)
  view.setUint32(4, blocks[0].offset, true)

  frames.forEach((frame, pageIndex) => {
    const block = blocks[pageIndex]
    const ifdOffset = block.offset
    const bitsOffset = ifdOffset + ifdBytes
    const xResolutionOffset = bitsOffset + 8
    const yResolutionOffset = xResolutionOffset + 8
    const descriptionOffset = yResolutionOffset + 8
    const descriptionBytes = descriptions[pageIndex].length
    const pixelOffset = descriptionOffset + descriptionBytes + (descriptionBytes % 2)
    view.setUint16(ifdOffset, ifdEntryCount, true)
    let entryOffset = ifdOffset + 2
    const entry = (tag: number, type: number, count: number, value: number) => {
      view.setUint16(entryOffset, tag, true); view.setUint16(entryOffset + 2, type, true); view.setUint32(entryOffset + 4, count, true)
      if (type === 3 && count === 1) { view.setUint16(entryOffset + 8, value, true); view.setUint16(entryOffset + 10, 0, true) } else view.setUint32(entryOffset + 8, value, true)
      entryOffset += 12
    }
    entry(256, 4, 1, frame.pixels.width)
    entry(257, 4, 1, frame.pixels.height)
    entry(258, 3, 4, bitsOffset)
    entry(259, 3, 1, 1)
    entry(262, 3, 1, 2)
    entry(270, 2, descriptionBytes, descriptionOffset)
    entry(273, 4, 1, pixelOffset)
    entry(277, 3, 1, 4)
    entry(278, 4, 1, frame.pixels.height)
    entry(279, 4, 1, frame.pixels.data.byteLength)
    entry(282, 5, 1, xResolutionOffset)
    entry(283, 5, 1, yResolutionOffset)
    entry(296, 3, 1, 2)
    entry(338, 3, 1, 2)
    view.setUint32(entryOffset, blocks[pageIndex + 1]?.offset ?? 0, true)
    for (let index = 0; index < 4; index += 1) view.setUint16(bitsOffset + index * 2, 8, true)
    view.setUint32(xResolutionOffset, Math.max(1, Math.round(dpi * 100)), true); view.setUint32(xResolutionOffset + 4, 100, true)
    view.setUint32(yResolutionOffset, Math.max(1, Math.round(dpi * 100)), true); view.setUint32(yResolutionOffset + 4, 100, true)
    writeAscii(bytes, descriptionOffset, frame.name)
    bytes.set(frame.pixels.data, pixelOffset)
  })
  return new Blob([bytes], { type: 'image/tiff' })
}

export async function encodeAvif(frame: RasterExportFrame) {
  const { default: encode } = await import('@jsquash/avif/encode.js')
  const output = await encode(frame.pixels, { quality: 82, qualityAlpha: 90, speed: 6 })
  return new Blob([output], { type: 'image/avif' })
}

export async function encodeApng(frames: RasterExportFrame[]) {
  const UPNG = await import('upng-js')
  const width = frames[0].pixels.width
  const height = frames[0].pixels.height
  if (frames.some((frame) => frame.pixels.width !== width || frame.pixels.height !== height)) throw new Error('Every APNG frame must have the same canvas size.')
  const output = UPNG.encode(frames.map((frame) => frame.pixels.data.buffer.slice(0)), width, height, 0, frames.map((frame) => frame.delayMs ?? 100))
  return new Blob([output], { type: 'image/apng' })
}

export async function encodeGif(frames: RasterExportFrame[]) {
  // @ts-expect-error gifenc 1.0.3 is browser-safe ESM but does not publish declarations.
  const { GIFEncoder, applyPalette, quantize } = await import('gifenc') as GifModule
  const gif = GIFEncoder()
  for (const [index, frame] of frames.entries()) {
    const palette = quantize(frame.pixels.data, 256, { format: 'rgba4444', oneBitAlpha: true })
    const indexed = applyPalette(frame.pixels.data, palette, 'rgba4444')
    const transparentIndex = palette.findIndex((color) => (color[3] ?? 255) === 0)
    gif.writeFrame(indexed, frame.pixels.width, frame.pixels.height, { palette, delay: frame.delayMs ?? 100, repeat: 0, transparent: transparentIndex >= 0, transparentIndex: Math.max(0, transparentIndex) })
    if (index === 0 && frames.length === 1) break
  }
  gif.finish()
  return new Blob([new Uint8Array(gif.bytes())], { type: 'image/gif' })
}

export async function encodePdf(frame: RasterExportFrame, dpi = 300, metadata: { author?: string; description?: string; title?: string } = {}) {
  const { PDFDocument } = await import('pdf-lib')
  const png = await pixelsToPng(frame.pixels, 'Could not render the PDF image.')
  const pdf = await PDFDocument.create()
  if (metadata.title) pdf.setTitle(metadata.title)
  if (metadata.author) pdf.setAuthor(metadata.author)
  if (metadata.description) pdf.setSubject(metadata.description)
  pdf.setCreator('Studio')
  const image = await pdf.embedPng(await png.arrayBuffer())
  const width = frame.pixels.width / dpi * 72
  const height = frame.pixels.height / dpi * 72
  const page = pdf.addPage([width, height])
  page.drawImage(image, { x: 0, y: 0, width, height })
  return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' })
}

export async function encodePrintPdf(frame: RasterExportFrame, settings: { widthInches: number; heightInches: number; bleedInches: number; cropMarks: boolean }, metadata: { author?: string; description?: string; title?: string } = {}) {
  const { PDFDocument, grayscale } = await import('pdf-lib')
  const png = await pixelsToPng(frame.pixels, 'Could not render print pixels.')
  const pdf = await PDFDocument.create()
  if (metadata.title) pdf.setTitle(metadata.title)
  if (metadata.author) pdf.setAuthor(metadata.author)
  if (metadata.description) pdf.setSubject(metadata.description)
  pdf.setCreator('Studio')
  const image = await pdf.embedPng(await png.arrayBuffer())
  const trimWidth = settings.widthInches * 72
  const trimHeight = settings.heightInches * 72
  const bleed = settings.bleedInches * 72
  const marks = settings.cropMarks ? 18 : 0
  const page = pdf.addPage([trimWidth + bleed * 2 + marks * 2, trimHeight + bleed * 2 + marks * 2])
  page.drawImage(image, { x: marks, y: marks, width: trimWidth + bleed * 2, height: trimHeight + bleed * 2 })
  if (settings.cropMarks) {
    const left = marks + bleed; const right = left + trimWidth; const bottom = marks + bleed; const top = bottom + trimHeight
    const line = (start: { x: number; y: number }, end: { x: number; y: number }) => page.drawLine({ start, end, thickness: 0.5, color: grayscale(0) })
    line({ x: left, y: 2 }, { x: left, y: marks + bleed / 2 }); line({ x: right, y: 2 }, { x: right, y: marks + bleed / 2 })
    line({ x: left, y: page.getHeight() - 2 }, { x: left, y: top + bleed / 2 }); line({ x: right, y: page.getHeight() - 2 }, { x: right, y: top + bleed / 2 })
    line({ x: 2, y: bottom }, { x: marks + bleed / 2, y: bottom }); line({ x: 2, y: top }, { x: marks + bleed / 2, y: top })
    line({ x: page.getWidth() - 2, y: bottom }, { x: right + bleed / 2, y: bottom }); line({ x: page.getWidth() - 2, y: top }, { x: right + bleed / 2, y: top })
  }
  return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' })
}
