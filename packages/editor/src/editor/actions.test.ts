import { describe, expect, it } from 'vitest'
import { actionConditionMatches, applyBatchPixelActions, normalizeActions } from './actions'

describe('local actions', () => {
  it('normalizes conditional recorded steps', () => {
    expect(normalizeActions([{ id: 'a', name: ' Web ', steps: [{ id: 's', command: 'invert', condition: 'raster-layer', enabled: true }, { command: 'unknown' }] }])).toEqual([{ id: 'a', name: 'Web', steps: [{ id: 's', command: 'invert', condition: 'raster-layer', enabled: true }] }])
    expect(actionConditionMatches('multiple-layers', { hasSelection: false, rasterLayer: false, selectedLayers: 2 })).toBe(true)
  })

  it('runs batch-safe pixel commands without changing alpha', () => {
    expect([...applyBatchPixelActions(new Uint8ClampedArray([10, 20, 30, 40]), ['invert', 'grayscale'])]).toEqual([236, 236, 236, 40])
  })
})
