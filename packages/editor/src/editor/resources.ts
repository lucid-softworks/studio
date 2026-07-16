const DATABASE_NAME = 'studio-client-resources'
const DATABASE_VERSION = 1
const FONT_STORE = 'fonts'
const BRUSH_STORE = 'brushes'
const MAX_RESOURCE_SIZE = 30 * 1024 * 1024
const FONT_EXTENSIONS = new Set(['ttf', 'otf', 'woff', 'woff2'])
const BRUSH_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const registeredFontFaces = new Map<string, FontFace>()

export type CustomFontResource = {
  id: string
  name: string
  family: string
}

export type BrushDynamics = {
  scatter: number
  count: number
  angleJitter: number
  roundness: number
  texture: number
  dualBrush: boolean
  hueJitter: number
  saturationJitter: number
  brightnessJitter: number
  smoothing: number
  buildUp: boolean
  tiltSize: boolean
  twistRotation: boolean
}

export type BrushPreset = {
  id: string
  name: string
  spacing: number
  tip: HTMLCanvasElement | null
  builtIn?: boolean
  dynamics?: Partial<BrushDynamics>
}

type StoredFont = CustomFontResource & { blob: Blob }
type StoredBrush = Omit<BrushPreset, 'tip' | 'builtIn'> & { blob: Blob }
type PortableBrush = { app: 'studio-brush'; version: 1; name?: string; spacing?: number; tipData: string; dynamics?: Partial<BrushDynamics> }

export const roundBrush: BrushPreset = { id: 'round', name: 'Round', spacing: 12, tip: null, builtIn: true }
export const defaultBrushDynamics: BrushDynamics = { scatter: 0, count: 1, angleJitter: 0, roundness: 100, texture: 0, dualBrush: false, hueJitter: 0, saturationJitter: 0, brightnessJitter: 0, smoothing: 35, buildUp: true, tiltSize: false, twistRotation: true }

function resourceId(prefix: string) {
  const random = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${random}`
}

function fileExtension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function resourceName(name: string) {
  return name.replace(/\.[^.]+$/, '').trim() || 'Untitled resource'
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(FONT_STORE)) request.result.createObjectStore(FONT_STORE, { keyPath: 'id' })
      if (!request.result.objectStoreNames.contains(BRUSH_STORE)) request.result.createObjectStore(BRUSH_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('The local resource library could not be opened.'))
  })
}

function storeRequest<T>(storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    const request = operation(transaction.objectStore(storeName))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('The local resource library could not be updated.'))
    transaction.oncomplete = () => database.close()
  }))
}

async function registerFont(font: StoredFont): Promise<CustomFontResource> {
  const face = new FontFace(font.family, await font.blob.arrayBuffer())
  await face.load()
  document.fonts.add(face)
  registeredFontFaces.set(font.id, face)
  return { id: font.id, name: font.name, family: font.family }
}

export async function importFont(file: File): Promise<CustomFontResource> {
  if (!FONT_EXTENSIONS.has(fileExtension(file.name))) throw new Error('Choose a TTF, OTF, WOFF, or WOFF2 font.')
  if (file.size > MAX_RESOURCE_SIZE) throw new Error('That font is over the 30 MB limit.')
  const id = resourceId('font')
  const stored: StoredFont = { id, name: resourceName(file.name), family: `Studio Font ${id}`, blob: file }
  const font = await registerFont(stored).catch(() => { throw new Error('That font could not be decoded.') })
  await storeRequest(FONT_STORE, 'readwrite', (store) => store.put(stored))
  return font
}

export async function loadFontLibrary(): Promise<CustomFontResource[]> {
  const stored = await storeRequest<StoredFont[]>(FONT_STORE, 'readonly', (store) => store.getAll())
  const fonts = await Promise.all(stored.map(async (font) => {
    try { return await registerFont(font) } catch { return null }
  }))
  return fonts.filter((font): font is CustomFontResource => font !== null)
}

export async function removeFont(id: string) {
  const face = registeredFontFaces.get(id)
  if (face) document.fonts.delete(face)
  registeredFontFaces.delete(id)
  await storeRequest(FONT_STORE, 'readwrite', (store) => store.delete(id))
}

export function brushAlpha(red: number, green: number, blue: number, alpha: number, hasTransparency: boolean) {
  if (hasTransparency) return alpha
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  return Math.round(255 - luminance)
}

function decodeImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The brush tip image could not be decoded.')) }
    image.src = url
  })
}

async function createBrushTip(blob: Blob) {
  const image = await decodeImage(blob)
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight)
  if (!longestSide) throw new Error('The brush tip image is empty.')
  const scale = Math.min(1, 512 / longestSide)
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const size = Math.max(width, height)
  const surface = document.createElement('canvas')
  surface.width = size
  surface.height = size
  const context = surface.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('The brush tip could not be created.')
  context.drawImage(image, Math.floor((size - width) / 2), Math.floor((size - height) / 2), width, height)
  const pixels = context.getImageData(0, 0, size, size)
  const hasTransparency = pixels.data.some((value, index) => index % 4 === 3 && value < 255)
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    pixels.data[offset + 3] = brushAlpha(pixels.data[offset], pixels.data[offset + 1], pixels.data[offset + 2], pixels.data[offset + 3], hasTransparency)
    pixels.data[offset] = 255
    pixels.data[offset + 1] = 255
    pixels.data[offset + 2] = 255
  }
  context.putImageData(pixels, 0, 0)
  return surface
}

async function portableBrush(file: File) {
  let parsed: PortableBrush
  try { parsed = JSON.parse(await file.text()) as PortableBrush } catch { throw new Error('That brush preset is not valid JSON.') }
  if (parsed.app !== 'studio-brush' || parsed.version !== 1 || typeof parsed.tipData !== 'string') throw new Error('That Studio brush preset is not supported.')
  const response = await fetch(parsed.tipData)
  const blob = await response.blob()
  if (!BRUSH_IMAGE_TYPES.has(blob.type)) throw new Error('The preset does not contain a supported brush tip image.')
  return { blob, name: parsed.name || resourceName(file.name), spacing: Math.max(1, Math.min(100, parsed.spacing ?? 18)), dynamics: parsed.dynamics }
}

async function brushSource(file: File) {
  const extension = fileExtension(file.name)
  if (extension === 'studio-brush' || extension === 'json') return portableBrush(file)
  if (!BRUSH_IMAGE_TYPES.has(file.type)) throw new Error('Choose a PNG, JPEG, WebP, or Studio brush preset.')
  return { blob: file as Blob, name: resourceName(file.name), spacing: 18, dynamics: undefined }
}

async function hydrateBrush(stored: StoredBrush): Promise<BrushPreset> {
  return { id: stored.id, name: stored.name, spacing: stored.spacing, tip: await createBrushTip(stored.blob), dynamics: stored.dynamics }
}

export async function importBrush(file: File): Promise<BrushPreset> {
  if (file.size > MAX_RESOURCE_SIZE) throw new Error('That brush is over the 30 MB limit.')
  const source = await brushSource(file)
  const stored: StoredBrush = { id: resourceId('brush'), name: source.name, spacing: source.spacing, blob: source.blob, dynamics: source.dynamics }
  const brush = await hydrateBrush(stored)
  await storeRequest(BRUSH_STORE, 'readwrite', (store) => store.put(stored))
  return brush
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The brush tip could not be encoded.')), 'image/png'))
}

export async function importBrushes(file: File): Promise<BrushPreset[]> {
  if (file.size > MAX_RESOURCE_SIZE) throw new Error('That brush pack is over the 30 MB limit.')
  if (fileExtension(file.name) !== 'abr') return [await importBrush(file)]
  const { parseAbrBuffer } = await import('./abr')
  const parsed = parseAbrBuffer(await file.arrayBuffer())
  const brushes: BrushPreset[] = []
  for (const brush of parsed) {
    if (!brush.tip) continue
    const stored: StoredBrush = { id: resourceId('brush'), name: brush.name, spacing: brush.spacing, dynamics: brush.dynamics, blob: await canvasBlob(brush.tip) }
    const hydrated = await hydrateBrush(stored)
    await storeRequest(BRUSH_STORE, 'readwrite', (store) => store.put(stored))
    brushes.push(hydrated)
  }
  return brushes
}

export async function serializeBrushPreset(brush: BrushPreset) {
  if (!brush.tip) throw new Error('Built-in brushes do not have a portable tip.')
  const blob = await canvasBlob(brush.tip)
  const tipData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('The brush tip could not be read.'))
    reader.readAsDataURL(blob)
  })
  return new Blob([JSON.stringify({ app: 'studio-brush', version: 1, name: brush.name, spacing: brush.spacing, tipData, dynamics: brush.dynamics } satisfies PortableBrush, null, 2)], { type: 'application/json' })
}

export async function loadBrushLibrary(): Promise<BrushPreset[]> {
  const stored = await storeRequest<StoredBrush[]>(BRUSH_STORE, 'readonly', (store) => store.getAll())
  const brushes = await Promise.all(stored.map(async (brush) => {
    try { return await hydrateBrush(brush) } catch { return null }
  }))
  return brushes.filter((brush): brush is BrushPreset => brush !== null)
}

export async function removeBrush(id: string) {
  await storeRequest(BRUSH_STORE, 'readwrite', (store) => store.delete(id))
}
