import { describe, expect, it } from 'vitest'
import { brushStampAlpha, brushStampRadius, dynamicBrushStamps, interpolateBrushStamps, normalizePointerInput, normalizePointerPressure, smoothBrushPoint } from './brush-engine'

describe('brush engine', () => {
  it('uses full pressure for mouse input and preserves pen pressure', () => {
    expect(normalizePointerPressure('mouse', 0.5)).toBe(1)
    expect(normalizePointerPressure('pen', 0.35)).toBe(0.35)
    expect(normalizePointerPressure('pen', 0)).toBe(0.05)
  })

  it('interpolates stamps using diameter-relative spacing', () => {
    const stamps = interpolateBrushStamps({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.2, 1, 20, 25)
    expect(stamps).toHaveLength(20)
    expect(stamps.at(-1)).toEqual({ x: 100, y: 0, pressure: 1 })
  })

  it('applies pressure dynamics to size and opacity', () => {
    expect(brushStampRadius(40, 0.25, true)).toBe(10)
    expect(brushStampRadius(40, 0.25, false)).toBe(40)
    expect(brushStampAlpha(80, 50, 0.5, true)).toBeCloseTo(0.2)
  })

  it('calibrates tilt, twist, barrel button, smoothing, and deterministic dynamics', () => {
    const input = normalizePointerInput('pen', 0.6, 45, 0, 270, 2, { minimum: 0.1, maximum: 0.9, gamma: 2 })
    expect(input).toMatchObject({ tilt: 0.5, twist: 270, barrel: true })
    expect(input.pressure).toBeCloseTo(0.390625)
    expect(smoothBrushPoint({ x: 0, y: 0 }, { x: 100, y: 100 }, 100).x).toBeCloseTo(4.76)
    const dynamics = { scatter: 25, count: 2, angleJitter: 15, roundness: 80, texture: 30, dualBrush: false, hueJitter: 10, saturationJitter: 10, brightnessJitter: 10, smoothing: 0, buildUp: true, tiltSize: true, twistRotation: true }
    expect(dynamicBrushStamps([{ x: 10, y: 10, pressure: 1 }], 20, dynamics, input, 42)).toEqual(dynamicBrushStamps([{ x: 10, y: 10, pressure: 1 }], 20, dynamics, input, 42))
    expect(dynamicBrushStamps([{ x: 10, y: 10, pressure: 1 }], 20, dynamics, input, 42)).toHaveLength(2)
  })
})
