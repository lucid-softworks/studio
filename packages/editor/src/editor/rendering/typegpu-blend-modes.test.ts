import { describe, expect, it } from 'vitest'
import { blendNonSeparable, isTypeGpuBlendMode, typeGpuBlendModeCodes } from './typegpu-blend-modes'

describe('TypeGPU blend modes', () => {
  it('assigns stable unique shader codes', () => {
    const codes = Object.values(typeGpuBlendModeCodes)
    expect(codes).toEqual([...codes].sort((left, right) => left - right))
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('supports every document blend mode', () => {
    expect(isTypeGpuBlendMode('multiply')).toBe(true)
    expect(isTypeGpuBlendMode('soft-light')).toBe(true)
    expect(isTypeGpuBlendMode('hue')).toBe(true)
    expect(isTypeGpuBlendMode('saturation')).toBe(true)
    expect(isTypeGpuBlendMode('color')).toBe(true)
    expect(isTypeGpuBlendMode('luminosity')).toBe(true)
  })

  it('matches the non-separable reference fixtures', () => {
    const backdrop = [0.2, 0.6, 0.9] as const
    const source = [0.8, 0.25, 0.1] as const
    const fixtures = {
      hue: [0.9145, 0.3645, 0.2145],
      saturation: [0.2, 0.6, 0.9],
      color: [0.9145, 0.3645, 0.2145],
      luminosity: [0.0855, 0.4855, 0.7855],
    } as const

    for (const mode of ['hue', 'saturation', 'color', 'luminosity'] as const) {
      blendNonSeparable(mode, backdrop, source).forEach((channel, index) => {
        expect(channel).toBeCloseTo(fixtures[mode][index], 5)
      })
    }
  })
})
