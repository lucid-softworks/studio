import { ImageData } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { precisionFromImageData } from './precision'

Object.assign(globalThis, { ImageData })

describe('editable precision', () => {
  it('promotes 8-bit previews into 16-bit and linear 32-bit samples', () => {
    const pixels = new ImageData(new Uint8ClampedArray([128, 255, 0, 255]), 1, 1) as unknown as globalThis.ImageData
    expect(Array.from(precisionFromImageData(pixels, 16).data)).toEqual([32896, 65535, 0, 65535])
    const float = precisionFromImageData(pixels, 32).data
    expect(float[0]).toBeCloseTo(0.216, 2)
    expect(float[1]).toBe(1)
    expect(float[3]).toBe(1)
  })
})
