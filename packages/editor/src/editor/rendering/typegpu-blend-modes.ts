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
} as const satisfies Partial<Record<BlendMode, number>>

export type TypeGpuBlendMode = keyof typeof typeGpuBlendModeCodes

export function isTypeGpuBlendMode(blendMode: BlendMode): blendMode is TypeGpuBlendMode {
  return blendMode in typeGpuBlendModeCodes
}
