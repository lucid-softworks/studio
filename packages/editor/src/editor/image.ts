import type { SourceImage } from './runtime-assets'
import type { RasterRegion } from './raster'

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/x-icon', 'image/vnd.microsoft.icon'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'ico'])
const MAX_FILE_SIZE = 512 * 1024 * 1024

export function validateImageFile(file: File) {
  const extension = file.name.split('.').pop()?.toLocaleLowerCase() ?? ''
  if (!IMAGE_TYPES.has(file.type) && !IMAGE_EXTENSIONS.has(extension)) {
    throw new Error('Choose a supported browser image.')
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error('That image is over the 512 MB safety limit.')
  }
}

function decodeImage(src: string, signal?: AbortSignal) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    const cleanup = () => signal?.removeEventListener('abort', cancel)
    const cancel = () => { image.src = ''; cleanup(); reject(signal?.reason instanceof Error ? signal.reason : new DOMException('Image decoding was cancelled.', 'AbortError')) }
    image.onload = () => { cleanup(); resolve(image) }
    image.onerror = () => { cleanup(); reject(new Error('The image could not be decoded.')) }
    signal?.addEventListener('abort', cancel, { once: true })
    image.src = src
  })
}

export async function loadImageFile(file: File, signal?: AbortSignal): Promise<SourceImage> {
  validateImageFile(file)
  signal?.throwIfAborted()
  const objectUrl = URL.createObjectURL(file)

  try {
    const element = await decodeImage(objectUrl, signal)
    return { element, name: file.name, blob: file }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function loadImageBlob(blob: Blob, name: string, signal?: AbortSignal): Promise<SourceImage> {
  signal?.throwIfAborted()
  const objectUrl = URL.createObjectURL(blob)
  try {
    const element = await decodeImage(objectUrl, signal)
    return { element, name, blob }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function createEmptyRasterSource(width: number, height: number, name: string): SourceImage {
  const surface = document.createElement('canvas')
  surface.width = width
  surface.height = height
  return { element: new Image(), name, surface, revision: 0, contentBounds: null }
}

export function createLayerMaskSource(width: number, height: number, name: string): SourceImage {
  const source = createEmptyRasterSource(width, height, name)
  const context = source.surface?.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('A layer mask could not be created.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  source.contentBounds = { x: 0, y: 0, width, height }
  return source
}

export function cloneRasterSource(source: SourceImage, name: string): SourceImage {
  const input = source.surface ?? source.element
  const width = source.surface?.width ?? source.element.naturalWidth
  const height = source.surface?.height ?? source.element.naturalHeight
  const copy = createEmptyRasterSource(width, height, name)
  const context = copy.surface?.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('The raster layer could not be duplicated.')
  context.drawImage(input, 0, 0, width, height)
  copy.contentBounds = source.contentBounds ? { ...source.contentBounds } : source.contentBounds
  return copy
}

export function alphaBoundsInRegion(surface: HTMLCanvasElement, region: RasterRegion): RasterRegion | null {
  const x = Math.max(0, Math.min(surface.width, Math.floor(region.x)))
  const y = Math.max(0, Math.min(surface.height, Math.floor(region.y)))
  const width = Math.max(0, Math.min(surface.width - x, Math.ceil(region.width)))
  const height = Math.max(0, Math.min(surface.height - y, Math.ceil(region.height)))
  const context = surface.getContext('2d', { willReadFrequently: true })
  if (!context || width === 0 || height === 0) return null
  const pixels = context.getImageData(x, y, width, height).data
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
    if (pixels[(row * width + column) * 4 + 3] === 0) continue
    left = Math.min(left, column)
    top = Math.min(top, row)
    right = Math.max(right, column)
    bottom = Math.max(bottom, row)
  }
  return right < left ? null : { x: x + left, y: y + top, width: right - left + 1, height: bottom - top + 1 }
}

export function mergeRasterBounds(current: RasterRegion | null, changed: RasterRegion | null) {
  if (!current) return changed
  if (!changed) return current
  const x = Math.min(current.x, changed.x)
  const y = Math.min(current.y, changed.y)
  const right = Math.max(current.x + current.width, changed.x + changed.width)
  const bottom = Math.max(current.y + current.height, changed.y + changed.height)
  return { x, y, width: right - x, height: bottom - y }
}

export function createRasterSurface(source: SourceImage) {
  const surface = document.createElement('canvas')
  surface.width = source.element.naturalWidth
  surface.height = source.element.naturalHeight
  const context = surface.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('A raster editing surface could not be created.')
  context.drawImage(source.element, 0, 0)
  return { ...source, surface, revision: 0 }
}

export function surfaceToBlob(surface: HTMLCanvasElement, type = 'image/png') {
  return new Promise<Blob>((resolve, reject) => surface.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The raster layer could not be encoded.')), type))
}
