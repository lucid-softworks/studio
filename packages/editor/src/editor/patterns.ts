import { normalizeHexColor } from './swatches'
import type { PatternKind, PatternSettings } from './types'

export type PatternPreset = PatternSettings & { id: string; name: string; kind: Exclude<PatternKind, 'none'> }

export const defaultPatterns: readonly PatternPreset[] = [
  { id: 'graphite-grid', name: 'Graphite grid', kind: 'grid', color: '#71717a', opacity: 18, size: 32 },
  { id: 'blueprint', name: 'Blueprint', kind: 'grid', color: '#38bdf8', opacity: 28, size: 48 },
  { id: 'fine-grid', name: 'Fine grid', kind: 'grid', color: '#ffffff', opacity: 12, size: 18 },
  { id: 'soft-dots', name: 'Soft dots', kind: 'dots', color: '#ffffff', opacity: 20, size: 32 },
  { id: 'violet-dots', name: 'Violet dots', kind: 'dots', color: '#c4b5fd', opacity: 32, size: 22 },
  { id: 'gentle-waves', name: 'Gentle waves', kind: 'waves', color: '#67e8f9', opacity: 24, size: 42 },
]

const patternKinds: PatternPreset['kind'][] = ['grid', 'dots', 'waves', 'bitmap']
const bitmapCache = new Map<string, Uint8ClampedArray>()

function clampNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(minimum, Math.min(maximum, value))) : fallback
}

function normalizeBitmap(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<NonNullable<PatternSettings['bitmap']>>
  const width = clampNumber(candidate.width, 0, 1, 256)
  const height = clampNumber(candidate.height, 0, 1, 256)
  if (!width || !height || typeof candidate.data !== 'string' || candidate.data.length > 350_000) return undefined
  try {
    if (atob(candidate.data).length !== width * height * 4) return undefined
  } catch { return undefined }
  return { width, height, data: candidate.data }
}

export function patternBitmapBytes(bitmap: NonNullable<PatternSettings['bitmap']>) {
  const cached = bitmapCache.get(bitmap.data)
  if (cached) return cached
  const binary = atob(bitmap.data)
  const bytes = Uint8ClampedArray.from(binary, (character) => character.charCodeAt(0))
  bitmapCache.set(bitmap.data, bytes)
  return bytes
}

export function bitmapPatternColor(pattern: PatternSettings, x: number, y: number) {
  if (pattern.kind !== 'bitmap' || !pattern.bitmap) return null
  const bytes = patternBitmapBytes(pattern.bitmap)
  const px = ((Math.floor(x) % pattern.bitmap.width) + pattern.bitmap.width) % pattern.bitmap.width
  const py = ((Math.floor(y) % pattern.bitmap.height) + pattern.bitmap.height) % pattern.bitmap.height
  const offset = (py * pattern.bitmap.width + px) * 4
  return [bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]] as const
}

export function patternBitmapCanvas(bitmap: NonNullable<PatternSettings['bitmap']>) {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const bytes = new Uint8ClampedArray(bitmap.width * bitmap.height * 4)
  bytes.set(patternBitmapBytes(bitmap))
  canvas.getContext('2d')?.putImageData(new ImageData(bytes, bitmap.width, bitmap.height), 0, 0)
  return canvas
}

export function normalizeCustomPatterns(value: unknown) {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((entry, index): PatternPreset[] => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Partial<PatternPreset>
    const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 48) : ''
    const kind = patternKinds.includes(candidate.kind as PatternPreset['kind']) ? candidate.kind as PatternPreset['kind'] : null
    const bitmap = normalizeBitmap(candidate.bitmap)
    const color = normalizeHexColor(candidate.color, kind === 'bitmap' ? '#ffffff' : '')
    const opacity = clampNumber(candidate.opacity, 100, 1, 100)
    const size = clampNumber(candidate.size, bitmap?.width ?? 40, kind === 'bitmap' ? 1 : 12, 256)
    const signature = `${kind}:${color}:${opacity}:${size}:${bitmap?.data.slice(0, 80) ?? ''}:${name.toLocaleLowerCase()}`
    if (!name || !kind || !color || (kind === 'bitmap' && !bitmap) || seen.has(signature)) return []
    seen.add(signature)
    const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim().slice(0, 80) : `pattern-${index}`
    return [{ id, name, kind, color, opacity, size, bitmap }]
  }).slice(0, 48)
}

function bytesBase64(bytes: Uint8ClampedArray) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(binary)
}

export async function importPatternFile(file: File): Promise<PatternPreset> {
  if (file.size > 10 * 1024 * 1024) throw new Error('That pattern is over the 10 MB limit.')
  if (file.name.toLowerCase().endsWith('.studio-pattern') || file.type === 'application/json') {
    const parsed = JSON.parse(await file.text()) as { app?: string; version?: number; pattern?: unknown }
    if (parsed.app !== 'studio-pattern' || parsed.version !== 1) throw new Error('That Studio pattern preset is not supported.')
    const normalized = normalizeCustomPatterns([parsed.pattern])
    if (!normalized.length) throw new Error('That pattern preset does not contain valid pattern data.')
    return normalized[0]
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG, WebP, or Studio pattern preset.')
  const image = await createImageBitmap(file)
  const scale = Math.min(1, 256 / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('The bitmap pattern could not be decoded.')
  context.drawImage(image, 0, 0, width, height)
  image.close()
  const bitmap = { width, height, data: bytesBase64(context.getImageData(0, 0, width, height).data) }
  return { id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, '').slice(0, 48) || 'Bitmap pattern', kind: 'bitmap', color: '#ffffff', opacity: 100, size: width, bitmap }
}

export function serializePatternPreset(pattern: PatternPreset) {
  return new Blob([JSON.stringify({ app: 'studio-pattern', version: 1, pattern }, null, 2)], { type: 'application/json' })
}
