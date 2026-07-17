import { hexToRgba } from './raster'
import type { PatternSettings } from './types'
import { bitmapPatternColor } from './patterns'

export type RetouchMode = 'color-replacement' | 'mixer-brush' | 'history-brush' | 'pattern-stamp' | 'dodge' | 'burn' | 'sponge' | 'blur' | 'sharpen' | 'smudge'
export type ToneRange = 'shadows' | 'midtones' | 'highlights'

export type RetouchStampOptions = {
  mode: RetouchMode
  color: string
  strength: number
  pattern: PatternSettings
  targetColor?: [number, number, number]
  mixerColor?: [number, number, number]
  delta?: { x: number; y: number }
  origin?: { x: number; y: number }
  toneRange?: ToneRange
  protectTones?: boolean
  spongeMode?: 'saturate' | 'desaturate'
  vibrance?: boolean
}

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

function pixel(data: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const px = Math.max(0, Math.min(width - 1, Math.round(x)))
  const py = Math.max(0, Math.min(height - 1, Math.round(y)))
  const offset = (py * width + px) * 4
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]] as const
}

function blurred(data: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const result = [0, 0, 0, 0]
  for (let row = -1; row <= 1; row += 1) for (let column = -1; column <= 1; column += 1) {
    const sample = pixel(data, width, height, x + column, y + row)
    for (let channel = 0; channel < 4; channel += 1) result[channel] += sample[channel] / 9
  }
  return result
}

function patternColor(pattern: PatternSettings, x: number, y: number, fallback: [number, number, number]) {
  const bitmap = bitmapPatternColor(pattern, x / Math.max(0.01, pattern.size / Math.max(1, pattern.bitmap?.width ?? pattern.size)), y / Math.max(0.01, pattern.size / Math.max(1, pattern.bitmap?.width ?? pattern.size)))
  if (bitmap) {
    const opacity = bitmap[3] / 255 * pattern.opacity / 100
    return fallback.map((value, channel) => value * (1 - opacity) + bitmap[channel] * opacity) as [number, number, number]
  }
  const color = hexToRgba(pattern.color)
  const size = Math.max(4, pattern.size)
  let active = false
  if (pattern.kind === 'grid') active = x % size < Math.max(1, size / 12) || y % size < Math.max(1, size / 12)
  else if (pattern.kind === 'dots') active = Math.hypot(x % size - size / 2, y % size - size / 2) < size / 7
  else if (pattern.kind === 'waves') active = Math.abs((y % size) - size / 2 - Math.sin(x / size * Math.PI * 2) * size / 5) < Math.max(1, size / 14)
  const opacity = active ? pattern.opacity / 100 : 0
  return fallback.map((value, channel) => value * (1 - opacity) + color[channel] * opacity) as [number, number, number]
}

/** Applies a feathered, deterministic retouch stamp to a full raster snapshot. */
export function applyRetouchStamp(image: ImageData, source: ImageData, centerX: number, centerY: number, radius: number, options: RetouchStampOptions) {
  const { width, height } = image
  const left = Math.max(0, Math.floor(centerX - radius))
  const top = Math.max(0, Math.floor(centerY - radius))
  const right = Math.min(width - 1, Math.ceil(centerX + radius))
  const bottom = Math.min(height - 1, Math.ceil(centerY + radius))
  const strength = Math.max(0, Math.min(1, options.strength / 100))
  const replacement = hexToRgba(options.color)
  for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
    const distance = Math.hypot(x - centerX, y - centerY)
    if (distance > radius) continue
    let feather = Math.min(1, Math.max(0, (1 - distance / radius) * 2)) * strength
    const offset = (y * width + x) * 4
    const current = pixel(image.data, width, height, x, y)
    let next: readonly number[] = current
    if (options.mode === 'color-replacement') {
      const target = options.targetColor ?? current.slice(0, 3) as [number, number, number]
      const difference = Math.max(...target.map((value, channel) => Math.abs(value - current[channel])))
      if (difference <= 72) next = [replacement[0], replacement[1], replacement[2], current[3]]
    } else if (options.mode === 'mixer-brush') {
      const mixed = options.mixerColor ?? replacement
      next = [mixed[0], mixed[1], mixed[2], current[3]]
    } else if (options.mode === 'history-brush') next = pixel(source.data, width, height, x, y)
    else if (options.mode === 'pattern-stamp') next = [...patternColor(options.pattern, x + (options.origin?.x ?? 0), y + (options.origin?.y ?? 0), replacement.slice(0, 3) as [number, number, number]), current[3]]
    else if (options.mode === 'dodge' || options.mode === 'burn') {
      const luminance = current[0] * 0.2126 + current[1] * 0.7152 + current[2] * 0.0722
      const normalized = luminance / 255
      const rangeWeight = options.toneRange === 'shadows' ? 1 - normalized : options.toneRange === 'highlights' ? normalized : 1 - Math.abs(normalized * 2 - 1)
      const amount = (0.15 + rangeWeight * 0.7)
      if (options.protectTones) {
        const targetLuminance = options.mode === 'dodge' ? luminance + (252 - luminance) * amount : Math.max(3, luminance * (1 - amount))
        const requestedRatio = targetLuminance / Math.max(1, luminance)
        const ratio = options.mode === 'dodge' ? Math.min(requestedRatio, 252 / Math.max(current[0], current[1], current[2], 1)) : requestedRatio
        next = [current[0] * ratio, current[1] * ratio, current[2] * ratio, current[3]]
      } else if (options.mode === 'dodge') next = [current[0] + (255 - current[0]) * amount, current[1] + (255 - current[1]) * amount, current[2] + (255 - current[2]) * amount, current[3]]
      else next = [current[0] * (1 - amount), current[1] * (1 - amount), current[2] * (1 - amount), current[3]]
    }
    else if (options.mode === 'sponge') {
      const luminance = current[0] * 0.2126 + current[1] * 0.7152 + current[2] * 0.0722
      const chroma = Math.max(current[0], current[1], current[2]) - Math.min(current[0], current[1], current[2])
      if (options.vibrance && options.spongeMode !== 'desaturate') feather *= 1 - chroma / 255 * 0.75
      const saturation = options.spongeMode === 'desaturate' ? 0 : 1.8
      next = [luminance + (current[0] - luminance) * saturation, luminance + (current[1] - luminance) * saturation, luminance + (current[2] - luminance) * saturation, current[3]]
    } else if (options.mode === 'blur') next = blurred(source.data, width, height, x, y)
    else if (options.mode === 'sharpen') {
      const average = blurred(source.data, width, height, x, y)
      next = current.map((value, channel) => channel === 3 ? value : value * 2 - average[channel])
    } else if (options.mode === 'smudge') next = pixel(source.data, width, height, x - (options.delta?.x ?? 0), y - (options.delta?.y ?? 0))
    for (let channel = 0; channel < 4; channel += 1) image.data[offset + channel] = clamp(current[channel] * (1 - feather) + next[channel] * feather)
  }
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

export function sampleAverageColor(image: ImageData, centerX: number, centerY: number, radius: number): [number, number, number] {
  const sum = [0, 0, 0]
  let weight = 0
  const step = Math.max(1, Math.floor(radius / 6))
  for (let y = centerY - radius; y <= centerY + radius; y += step) for (let x = centerX - radius; x <= centerX + radius; x += step) {
    if (Math.hypot(x - centerX, y - centerY) > radius) continue
    const sample = pixel(image.data, image.width, image.height, x, y)
    const alpha = sample[3] / 255
    for (let channel = 0; channel < 3; channel += 1) sum[channel] += sample[channel] * alpha
    weight += alpha
  }
  return sum.map((value) => clamp(value / Math.max(1, weight))) as [number, number, number]
}
