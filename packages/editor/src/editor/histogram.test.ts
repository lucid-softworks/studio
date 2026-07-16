import { describe, expect, it } from 'vitest'
import { calculateColorAnalysis, calculateHistogram, calculatePrecisionColorAnalysis } from './histogram'

describe('color analysis', () => {
  it('calculates channel bins and ignores fully transparent pixels', () => {
    const result = calculateHistogram(new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 0,
    ]))
    expect(result.pixels).toBe(2)
    expect(result.bins.red[255]).toBe(1)
    expect(result.bins.red[0]).toBe(1)
    expect(result.bins.blue[255]).toBe(0)
    expect(result.mean.red).toBe(127.5)
    expect(result.median.green).toBe(0)
  })

  it('reduces pixels into histogram, waveform, and vectorscope bins', () => {
    const result = calculateColorAnalysis(Uint8ClampedArray.from([
      255, 0, 0, 255,
      0, 0, 255, 255,
    ]), 2, 1, 8)
    expect(result.pixels).toBe(2)
    expect(result.bins.red[255]).toBe(1)
    expect(result.waveform?.reduce((sum, value) => sum + value, 0)).toBe(2)
    expect(result.vectorscope?.reduce((sum, value) => sum + value, 0)).toBe(2)
  })

  it('bins exact 16-bit samples without detaching source data', () => {
    const source = Uint16Array.from([65535, 32768, 0, 65535])
    const result = calculatePrecisionColorAnalysis(source, 16, 1, 1, 8)
    expect(result.precision).toBe(16)
    expect(result.exact).toBe(true)
    expect(result.bins.red[255]).toBe(1)
    expect(result.bins.green[128]).toBe(1)
    expect(source.byteLength).toBe(8)
  })
})
