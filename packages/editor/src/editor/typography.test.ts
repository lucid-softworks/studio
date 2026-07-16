import { describe, expect, it } from 'vitest'
import { flattenTextPath, polylineLength, samplePolyline, textWarpOffset, wrapTextRanges } from './typography'

describe('paragraph text layout', () => {
  it('wraps at word boundaries and preserves hard breaks', () => {
    const text = 'one two\nthree'
    const lines = wrapTextRanges(text, 4, (start, end) => end - start)
    expect(lines.map(({ start, end }) => text.slice(start, end))).toEqual(['one', 'two', 'thre', 'e'])
  })

  it('falls back to character wrapping for long words', () => {
    const text = 'abcdef'
    const lines = wrapTextRanges(text, 3, (start, end) => end - start)
    expect(lines.map(({ start, end }) => text.slice(start, end))).toEqual(['abc', 'def'])
  })

  it('flattens and samples editable bezier paths', () => {
    const points = flattenTextPath({ closed: false, operation: 'combine', fillRule: 'non-zero', knots: [
      { linked: true, in: { x: 0, y: 0 }, anchor: { x: 0, y: 0.5 }, out: { x: 0.33, y: 0.5 } },
      { linked: true, in: { x: 0.66, y: 0.5 }, anchor: { x: 1, y: 0.5 }, out: { x: 1, y: 0.5 } },
    ] }, 100, 100)
    expect(polylineLength(points)).toBeCloseTo(100, 0)
    expect(samplePolyline(points, 50)?.x).toBeCloseTo(50, 0)
  })

  it('evaluates distinct local warp styles and perspective', () => {
    expect(textWarpOffset('arc', 0.5, 50, 0, 100)).toBeCloseTo(-25)
    expect(textWarpOffset('wave', 0.5, 50, 0, 100)).toBeCloseTo(0)
    expect(textWarpOffset('arc', 1, 0, 20, 100)).toBeCloseTo(10)
  })
})
