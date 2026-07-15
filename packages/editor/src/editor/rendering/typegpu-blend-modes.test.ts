import { describe, expect, it } from 'vitest'
import { isTypeGpuBlendMode, typeGpuBlendModeCodes } from './typegpu-blend-modes'

describe('TypeGPU blend modes', () => {
  it('assigns stable unique shader codes', () => {
    const codes = Object.values(typeGpuBlendModeCodes)
    expect(codes).toEqual([...codes].sort((left, right) => left - right))
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('keeps non-separable color-space modes on the compatibility renderer', () => {
    expect(isTypeGpuBlendMode('multiply')).toBe(true)
    expect(isTypeGpuBlendMode('soft-light')).toBe(true)
    expect(isTypeGpuBlendMode('hue')).toBe(false)
    expect(isTypeGpuBlendMode('saturation')).toBe(false)
    expect(isTypeGpuBlendMode('color')).toBe(false)
    expect(isTypeGpuBlendMode('luminosity')).toBe(false)
  })
})
