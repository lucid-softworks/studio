import type { SourceImage } from './runtime-assets'

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

function decodeImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The image could not be decoded.'))
    image.src = src
  })
}

export async function loadImageFile(file: File): Promise<SourceImage> {
  validateImageFile(file)
  const objectUrl = URL.createObjectURL(file)

  try {
    const element = await decodeImage(objectUrl)
    return { element, name: file.name, blob: file, objectUrl }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

export async function loadImageBlob(blob: Blob, name: string): Promise<SourceImage> {
  const objectUrl = URL.createObjectURL(blob)
  try {
    const element = await decodeImage(objectUrl)
    return { element, name, blob, objectUrl }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

export function createEmptyRasterSource(width: number, height: number, name: string): SourceImage {
  const surface = document.createElement('canvas')
  surface.width = width
  surface.height = height
  return { element: new Image(), name, surface, revision: 0 }
}

export function createLayerMaskSource(width: number, height: number, name: string): SourceImage {
  const source = createEmptyRasterSource(width, height, name)
  const context = source.surface?.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('A layer mask could not be created.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
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
  return copy
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
