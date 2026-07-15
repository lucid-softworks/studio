import { describe, expect, it } from 'vitest'
import { d } from 'typegpu'
import { gpuApplyAdjustment } from './typegpu-compositor'

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
