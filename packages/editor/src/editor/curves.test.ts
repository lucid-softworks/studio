import { describe, expect, it } from 'vitest'
import { curvePreset, histogramRange, visibleHistogram } from './curves'

describe('curves', () => {
  it('creates reusable contrast and negative presets', () => {
    expect(curvePreset('strong-contrast')).toHaveLength(5)
    expect(curvePreset('negative')).toEqual([{ input: 0, output: 255 }, { input: 255, output: 0 }])
  })

  it('reduces visible pixels into channel histograms and tonal ranges', () => {
    const pixels = new Uint8ClampedArray([10, 20, 30, 255, 200, 210, 220, 255, 255, 255, 255, 0])
    const bins = visibleHistogram(pixels, 'red')
    expect(bins[10]).toBe(1)
    expect(bins[200]).toBe(1)
    expect(histogramRange(bins)).toEqual({ black: 10, median: 10, white: 200 })
  })
})
