import { describe, expect, it } from 'vitest'
import { calculateHistogram } from './histogram'

describe('histogram calculation', () => {
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
})
