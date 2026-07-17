import { describe, expect, it } from 'vitest'
import { colorSamplerReadout } from './color-samplers'

describe('color sampler readouts', () => {
  it('reports RGB, HSL, and CMYK values from one captured color', () => {
    expect(colorSamplerReadout('#ff0000')).toEqual({ rgb: [255, 0, 0], hsl: [0, 100, 50], cmyk: [0, 100, 100, 0] })
    expect(colorSamplerReadout('#808080')).toEqual({ rgb: [128, 128, 128], hsl: [0, 0, 50], cmyk: [0, 0, 0, 50] })
  })
})
