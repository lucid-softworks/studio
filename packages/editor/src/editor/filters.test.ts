import { describe, expect, it } from 'vitest'
import { layerFilterCss, normalizeLayerFilters } from './filters'

describe('layer filters', () => {
  it('normalizes legacy filter objects with the current defaults', () => {
    expect(normalizeLayerFilters({ brightness: 125, blur: 3 })).toEqual({
      brightness: 125,
      contrast: 100,
      saturation: 100,
      hue: 0,
      grayscale: 0,
      sepia: 0,
      invert: 0,
      blur: 3,
    })
  })

  it('renders every non-destructive filter into the canvas filter chain', () => {
    expect(layerFilterCss({ hue: 30, grayscale: 100, invert: 25 })).toContain('hue-rotate(30deg) grayscale(100%) sepia(0%) invert(25%)')
  })
})
