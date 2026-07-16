import { describe, expect, it } from 'vitest'
import { normalizeCustomGradients, normalizeGradientStops } from './gradients'

describe('gradient libraries', () => {
  it('normalizes ordered multi-stop gradients', () => {
    expect(normalizeGradientStops([{ color: '#00ff00', position: 50 }, { color: '#ff0000', position: 0 }, { color: '#0000ff', position: 100 }])).toEqual([
      { color: '#ff0000', position: 0 },
      { color: '#00ff00', position: 50 },
      { color: '#0000ff', position: 100 },
    ])
  })

  it('migrates legacy two-colour presets', () => {
    expect(normalizeCustomGradients([{ id: 'old', name: 'Old', start: '#112233', end: '#ddeeff' }])[0].stops).toEqual([
      { color: '#112233', position: 0 },
      { color: '#ddeeff', position: 100 },
    ])
  })
})
