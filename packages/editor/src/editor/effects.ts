import type { LayerEffects } from './types'

export const defaultLayerEffects: LayerEffects = {
  dropShadow: { enabled: false, color: '#000000', opacity: 55, angle: 45, distance: 18, blur: 24 },
  outerGlow: { enabled: false, color: '#8b5cf6', opacity: 60, size: 18 },
  colorOverlay: { enabled: false, color: '#8b5cf6', opacity: 70 },
}

export function normalizeLayerEffects(effects?: Partial<LayerEffects> | null): LayerEffects {
  return {
    dropShadow: { ...defaultLayerEffects.dropShadow, ...effects?.dropShadow },
    outerGlow: { ...defaultLayerEffects.outerGlow, ...effects?.outerGlow },
    colorOverlay: { ...defaultLayerEffects.colorOverlay, ...effects?.colorOverlay },
  }
}

export function hasEnabledLayerEffects(effects?: Partial<LayerEffects> | null) {
  const value = normalizeLayerEffects(effects)
  return value.dropShadow.enabled || value.outerGlow.enabled || value.colorOverlay.enabled
}
