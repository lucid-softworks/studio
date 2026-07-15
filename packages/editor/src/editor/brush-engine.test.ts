import { describe, expect, it } from 'vitest'
import { brushStampAlpha, brushStampRadius, interpolateBrushStamps, normalizePointerPressure } from './brush-engine'

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
})
