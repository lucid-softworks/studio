import type { BlendMode } from '../types'

export const typeGpuBlendModeCodes = {
  normal: 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
  darken: 4,
  lighten: 5,
  'color-dodge': 6,
  'color-burn': 7,
  'hard-light': 8,
  'soft-light': 9,
  difference: 10,
  exclusion: 11,
  hue: 12,
  saturation: 13,
  color: 14,
  luminosity: 15,
} as const satisfies Partial<Record<BlendMode, number>>

export type TypeGpuBlendMode = keyof typeof typeGpuBlendModeCodes

export function isTypeGpuBlendMode(blendMode: BlendMode): blendMode is TypeGpuBlendMode {
  return blendMode in typeGpuBlendModeCodes
}

export type RgbColor = readonly [number, number, number]

function luminosity(color: RgbColor) {
  return color[0] * 0.3 + color[1] * 0.59 + color[2] * 0.11
}

function saturation(color: RgbColor) {
  return Math.max(...color) - Math.min(...color)
}

function clipColor(color: RgbColor): RgbColor {
  const lightness = luminosity(color)
  const minimum = Math.min(...color)
  const maximum = Math.max(...color)
  let result = [...color] as [number, number, number]
  if (minimum < 0) result = result.map((channel) => lightness + ((channel - lightness) * lightness) / (lightness - minimum)) as [number, number, number]
  if (maximum > 1) result = result.map((channel) => lightness + ((channel - lightness) * (1 - lightness)) / (maximum - lightness)) as [number, number, number]
  return result
}

function setLuminosity(color: RgbColor, lightness: number): RgbColor {
  const delta = lightness - luminosity(color)
  return clipColor(color.map((channel) => channel + delta) as [number, number, number])
}

function setSaturation(color: RgbColor, value: number): RgbColor {
  const minimum = Math.min(...color)
  const range = Math.max(...color) - minimum
  if (range === 0) return [0, 0, 0]
  return color.map((channel) => ((channel - minimum) * value) / range) as [number, number, number]
}

export function blendNonSeparable(mode: 'hue' | 'saturation' | 'color' | 'luminosity', backdrop: RgbColor, source: RgbColor): RgbColor {
  if (mode === 'hue') return setLuminosity(setSaturation(source, saturation(backdrop)), luminosity(backdrop))
  if (mode === 'saturation') return setLuminosity(setSaturation(backdrop, saturation(source)), luminosity(backdrop))
  if (mode === 'color') return setLuminosity(source, luminosity(backdrop))
  return setLuminosity(backdrop, luminosity(source))
}
