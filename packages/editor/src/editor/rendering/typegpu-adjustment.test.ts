import { describe, expect, it } from 'vitest'
import { d } from 'typegpu'
import { gpuApplyAdjustment, gpuApplyLayerFilters } from './typegpu-compositor'

describe('TypeGPU adjustment shader', () => {
  it('keeps neutral adjustment parameters pixel-identical', () => {
    const adjusted = gpuApplyAdjustment(d.vec3f(0.2, 0.4, 0.6), 1, 1, 1, 0)

    expect(adjusted.x).toBeCloseTo(0.2, 6)
    expect(adjusted.y).toBeCloseTo(0.4, 6)
    expect(adjusted.z).toBeCloseTo(0.6, 6)
  })

  it('applies the same ordered color transforms on the CPU reference path', () => {
    const adjusted = gpuApplyAdjustment(d.vec3f(0.2, 0.3, 0.4), 2, 1, 0, 0)

    expect(adjusted.x).toBeCloseTo(0.5718, 4)
    expect(adjusted.y).toBeCloseTo(0.5718, 4)
    expect(adjusted.z).toBeCloseTo(0.5718, 4)
  })
})

describe('TypeGPU layer filter shader', () => {
  it('keeps neutral filters pixel-identical', () => {
    const filtered = gpuApplyLayerFilters(d.vec3f(0.2, 0.4, 0.6), 1, 1, 1, 0, 0, 0, 0)

    expect(filtered.x).toBeCloseTo(0.2, 6)
    expect(filtered.y).toBeCloseTo(0.4, 6)
    expect(filtered.z).toBeCloseTo(0.6, 6)
  })

  it('applies grayscale and inversion after color transforms', () => {
    const filtered = gpuApplyLayerFilters(d.vec3f(0.2, 0.4, 0.6), 1, 1, 1, 0, 1, 0, 1)
    const invertedLuminance = 1 - (0.2 * 0.2126 + 0.4 * 0.7152 + 0.6 * 0.0722)

    expect(filtered.x).toBeCloseTo(invertedLuminance, 5)
    expect(filtered.y).toBeCloseTo(invertedLuminance, 5)
    expect(filtered.z).toBeCloseTo(invertedLuminance, 5)
  })
})
