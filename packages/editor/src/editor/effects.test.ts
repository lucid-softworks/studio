import { describe, expect, it } from 'vitest'
import { defaultLayerEffects, hasEnabledLayerEffects, normalizeLayerEffects } from './effects'

describe('layer effects', () => {
  it('normalizes partial saved effects without losing current defaults', () => {
    expect(normalizeLayerEffects({ dropShadow: { ...defaultLayerEffects.dropShadow, enabled: true, distance: 32 } })).toEqual({
      ...defaultLayerEffects,
      dropShadow: { ...defaultLayerEffects.dropShadow, enabled: true, distance: 32 },
    })
  })

  it('reports whether any effect is enabled', () => {
    expect(hasEnabledLayerEffects()).toBe(false)
    expect(hasEnabledLayerEffects({ colorOverlay: { ...defaultLayerEffects.colorOverlay, enabled: true } })).toBe(true)
  })
})
