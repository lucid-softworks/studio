import { describe, expect, it } from 'vitest'
import { d } from 'typegpu'
import { calculateEffectOffset, gpuApplyAdjustment, gpuApplyLayerFilters, gpuTintEffect } from './typegpu-compositor'

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

describe('TypeGPU layer effect shader', () => {
  it('tints the sampled alpha with the configured effect color and opacity', () => {
    const effect = gpuTintEffect(0.8, d.vec3f(0.25, 0.5, 0.75), 0.5)

    expect(effect.x).toBeCloseTo(0.25, 6)
    expect(effect.y).toBeCloseTo(0.5, 6)
    expect(effect.z).toBeCloseTo(0.75, 6)
    expect(effect.w).toBeCloseTo(0.4, 6)
  })

  it('normalizes directional shadow offsets into texture coordinates', () => {
    const offset = calculateEffectOffset(90, 20, 200, 100)

    expect(offset.x).toBeCloseTo(0, 6)
    expect(offset.y).toBeCloseTo(0.2, 6)
  })
})
