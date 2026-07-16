import type { SourceImage } from './runtime-assets'
import type { DocumentFileMetadata } from './types'

export type DecodedRasterPage = { name: string; source: SourceImage; width: number; height: number }
export type AdvancedRasterImport = { pages: DecodedRasterPage[]; bitDepth: 8 | 16 | 32; metadata: DocumentFileMetadata; warnings: string[] }

const TIFF_EXTENSIONS = new Set(['tif', 'tiff', 'dng', 'cr2', 'nef', 'arw', 'orf', 'rw2'])
const ADVANCED_EXTENSIONS = new Set([...TIFF_EXTENSIONS, 'exr', 'hdr', 'heic', 'heif', 'avif', 'ico', 'pdf'])

export function advancedFormatForFile(file: Pick<File, 'name' | 'type'>) {
  const extension = file.name.split('.').pop()?.toLocaleLowerCase() ?? ''
  if (ADVANCED_EXTENSIONS.has(extension)) return extension
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type === 'image/tiff') return 'tiff'
  if (/image\/(heic|heif)/.test(file.type)) return 'heic'
  if (file.type === 'image/avif') return 'avif'
  if (/image\/(x-icon|vnd.microsoft.icon)/.test(file.type)) return 'ico'
  return null
}

function sourceFromImageData(pixels: ImageData, name: string, precision?: SourceImage['precision']): SourceImage {
  const surface = document.createElement('canvas')
  surface.width = pixels.width
  surface.height = pixels.height
  const context = surface.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Studio could not allocate an image surface for this file.')
  context.putImageData(pixels, 0, 0)
  return { element: new Image(), name, surface, revision: 0, precision }
}

function rgbaImageData(bytes: Uint8Array | Uint8ClampedArray, width: number, height: number) {
  return new ImageData(new Uint8ClampedArray(bytes), width, height)
}

function tiffNumber(ifd: Record<string, unknown>, tag: number) {
  const value = ifd[`t${tag}`]
  if (typeof value === 'number') return value
  if (Array.isArray(value) && typeof value[0] === 'number') return value[0]
  return undefined
}

function tiffBytes(ifd: Record<string, unknown>, tag: number) {
  const value = ifd[`t${tag}`]
  if (value instanceof Uint8Array) return Array.from(value)
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'number')) return value as number[]
  return undefined
}

async function decodeTiff(file: File, extension: string, signal?: AbortSignal): Promise<AdvancedRasterImport> {
  const [UTIF, buffer] = await Promise.all([import('utif'), file.arrayBuffer()])
  signal?.throwIfAborted()
  const ifds = UTIF.decode(buffer)
  const pages: DecodedRasterPage[] = []
  for (const [index, ifd] of ifds.entries()) {
    signal?.throwIfAborted()
    if (index > 0) await new Promise<void>((resolve) => setTimeout(resolve, 0))
    signal?.throwIfAborted()
    try {
      UTIF.decodeImage(buffer, ifd)
      if (!ifd.width || !ifd.height || !ifd.data) continue
      const rgba = UTIF.toRGBA8(ifd)
      pages.push({ name: ifds.length > 1 ? `${file.name} · page ${index + 1}` : file.name, width: ifd.width, height: ifd.height, source: sourceFromImageData(rgbaImageData(rgba, ifd.width, ifd.height), file.name) })
    } catch { /* RAW containers often include non-display sensor IFDs alongside a usable preview. */ }
  }
  if (!pages.length) throw new Error(TIFF_EXTENSIONS.has(extension) && !['tif', 'tiff'].includes(extension) ? 'This RAW file has no displayable preview that the local TIFF codec can decode. Studio never uploads RAW data for conversion.' : 'No displayable image directory was found in this TIFF file.')
  const first = ifds[0] as Record<string, unknown>
  const unit = tiffNumber(first, 296)
  const xResolution = tiffNumber(first, 282)
  const dpi = xResolution ? unit === 3 ? xResolution * 2.54 : xResolution : undefined
  const isRaw = !['tif', 'tiff'].includes(extension)
  return {
    pages,
    bitDepth: 8,
    metadata: { sourceFormat: isRaw ? 'raw' : 'tiff', resolutionDpi: dpi, orientation: tiffNumber(first, 274), icc: tiffBytes(first, 34675), importedAt: new Date().toISOString() },
    warnings: [
      ...(pages.length > 1 ? [`Imported ${pages.length} TIFF image directories as separate layers.`] : []),
      ...(isRaw ? ['Opened the locally decoded embedded RAW preview; sensor demosaicing is not available for this camera file.'] : []),
    ],
  }
}

async function decodeHdr(file: File, extension: 'hdr' | 'exr', signal?: AbortSignal): Promise<AdvancedRasterImport> {
  const { applyToneMapping, readExr, readHdr } = await import('hdrify')
  signal?.throwIfAborted()
  const image = extension === 'exr' ? readExr(new Uint8Array(await file.arrayBuffer())) : readHdr(new Uint8Array(await file.arrayBuffer()))
  signal?.throwIfAborted()
  const rgb = applyToneMapping(new Float32Array(image.data), image.width, image.height, { toneMapping: 'aces', metadata: image.metadata, sourceColorSpace: image.linearColorSpace })
  const rgba = new Uint8ClampedArray(image.width * image.height * 4)
  for (let source = 0, target = 0; source < rgb.length; source += 3, target += 4) {
    if (source > 0 && source % (1024 * 1024 * 3) === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      signal?.throwIfAborted()
    }
    rgba[target] = rgb[source]
    rgba[target + 1] = rgb[source + 1]
    rgba[target + 2] = rgb[source + 2]
    rgba[target + 3] = Math.round(Math.max(0, Math.min(1, image.data[target + 3] ?? 1)) * 255)
  }
  const precision = { bitDepth: 32 as const, width: image.width, height: image.height, data: new Float32Array(image.data), revision: 0 }
  return { pages: [{ name: file.name, width: image.width, height: image.height, source: sourceFromImageData(new ImageData(rgba, image.width, image.height), file.name, precision) }], bitDepth: 32, metadata: { sourceFormat: extension, hdrMetadata: image.metadata, importedAt: new Date().toISOString() }, warnings: ['The canvas preview uses ACES tone mapping; original linear float RGBA pixels remain editable in the 32-bit backing store.'] }
}

async function decodeHeif(file: File, signal?: AbortSignal): Promise<AdvancedRasterImport> {
  const { heicTo } = await import('heic-to/csp')
  signal?.throwIfAborted()
  const bitmap = await heicTo({ blob: file, type: 'bitmap' })
  if (signal?.aborted) { bitmap.close(); signal.throwIfAborted() }
  const surface = document.createElement('canvas')
  surface.width = bitmap.width
  surface.height = bitmap.height
  surface.getContext('2d', { willReadFrequently: true })?.drawImage(bitmap, 0, 0)
  bitmap.close()
  return { pages: [{ name: file.name, width: surface.width, height: surface.height, source: { element: new Image(), name: file.name, surface, revision: 0, blob: file } }], bitDepth: 8, metadata: { sourceFormat: 'heif', importedAt: new Date().toISOString() }, warnings: [] }
}

async function decodeAvif(file: File, signal?: AbortSignal): Promise<AdvancedRasterImport> {
  const { default: decode } = await import('@jsquash/avif/decode.js')
  signal?.throwIfAborted()
  const pixels = await decode(await file.arrayBuffer())
  signal?.throwIfAborted()
  if (!pixels) throw new Error('The local AVIF codec could not decode this image.')
  return { pages: [{ name: file.name, width: pixels.width, height: pixels.height, source: sourceFromImageData(pixels, file.name) }], bitDepth: 8, metadata: { sourceFormat: 'avif', importedAt: new Date().toISOString() }, warnings: [] }
}

async function decodePdf(file: File, signal?: AbortSignal): Promise<AdvancedRasterImport> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const cancel = () => { void task.destroy() }
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    signal?.throwIfAborted()
    const pdf = await task.promise
    const pages = await Promise.all(Array.from({ length: pdf.numPages }, async (_, index): Promise<DecodedRasterPage> => {
      const pageNumber = index + 1
      signal?.throwIfAborted()
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 2 })
      const surface = document.createElement('canvas')
      surface.width = Math.ceil(viewport.width)
      surface.height = Math.ceil(viewport.height)
      const context = surface.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Studio could not allocate a PDF page surface.')
      await page.render({ canvasContext: context, viewport }).promise
      signal?.throwIfAborted()
      const result = { name: `${file.name} · page ${pageNumber}`, width: surface.width, height: surface.height, source: { element: new Image(), name: file.name, surface, revision: 0 } }
      page.cleanup()
      return result
    }))
    return { pages, bitDepth: 8, metadata: { sourceFormat: 'pdf', resolutionDpi: 144, importedAt: new Date().toISOString() }, warnings: [`Rendered ${pages.length} PDF page${pages.length === 1 ? '' : 's'} locally at 144 ppi; text and vectors were rasterized.`] }
  } catch (error) {
    signal?.throwIfAborted()
    throw error
  } finally {
    signal?.removeEventListener('abort', cancel)
    await task.destroy().catch(() => undefined)
  }
}

async function decodeBrowserImage(file: File, format: 'ico', signal?: AbortSignal): Promise<AdvancedRasterImport> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const element = await new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); const cleanup = () => signal?.removeEventListener('abort', cancel); const cancel = () => { image.src = ''; cleanup(); reject(signal?.reason instanceof Error ? signal.reason : new DOMException('Icon decoding was cancelled.', 'AbortError')) }; image.onload = () => { cleanup(); resolve(image) }; image.onerror = () => { cleanup(); reject(new Error('The browser could not decode this icon.')) }; signal?.addEventListener('abort', cancel, { once: true }); image.src = objectUrl })
    const surface = document.createElement('canvas')
    surface.width = element.naturalWidth
    surface.height = element.naturalHeight
    surface.getContext('2d', { willReadFrequently: true })?.drawImage(element, 0, 0)
    return { pages: [{ name: file.name, width: surface.width, height: surface.height, source: { element, name: file.name, surface, revision: 0, blob: file, objectUrl } }], bitDepth: 8, metadata: { sourceFormat: format, importedAt: new Date().toISOString() }, warnings: [] }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

export async function importAdvancedRaster(file: File, signal?: AbortSignal): Promise<AdvancedRasterImport> {
  signal?.throwIfAborted()
  const format = advancedFormatForFile(file)
  if (!format) throw new Error('No advanced local codec is registered for this file.')
  if (TIFF_EXTENSIONS.has(format)) return decodeTiff(file, format, signal)
  if (format === 'hdr' || format === 'exr') return decodeHdr(file, format, signal)
  if (format === 'heic' || format === 'heif') return decodeHeif(file, signal)
  if (format === 'avif') return decodeAvif(file, signal)
  if (format === 'pdf') return decodePdf(file, signal)
  return decodeBrowserImage(file, 'ico', signal)
}
