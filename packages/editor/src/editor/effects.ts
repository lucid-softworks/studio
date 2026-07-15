import type { LayerEffects } from './types'

export const defaultLayerEffects: LayerEffects = {
  dropShadow: { enabled: false, color: '#000000', opacity: 55, angle: 45, distance: 18, blur: 24, spread: 0, blendMode: 'multiply' },
  innerShadow: { enabled: false, color: '#000000', opacity: 55, angle: 45, distance: 8, blur: 12, choke: 0, blendMode: 'multiply' },
  outerGlow: { enabled: false, color: '#8b5cf6', opacity: 60, size: 18, spread: 0, blendMode: 'screen' },
  innerGlow: { enabled: false, color: '#ffffff', opacity: 60, size: 14, choke: 0, source: 'edge', blendMode: 'screen' },
  bevel: { enabled: false, size: 6, depth: 100, angle: 120, altitude: 30, highlightColor: '#ffffff', highlightOpacity: 70, shadowColor: '#000000', shadowOpacity: 70, style: 'inner bevel', direction: 'up' },
  satin: { enabled: false, color: '#000000', opacity: 50, angle: 20, distance: 8, size: 14, invert: false, blendMode: 'multiply' },
  colorOverlay: { enabled: false, color: '#8b5cf6', opacity: 70, blendMode: 'normal' },
  gradientOverlay: { enabled: false, opacity: 100, angle: 90, scale: 100, style: 'linear', reverse: false, blendMode: 'normal', name: 'Foreground to background', gradientType: 'solid', colorStops: [{ color: '#000000', position: 0 }, { color: '#ffffff', position: 1 }], opacityStops: [{ opacity: 1, position: 0 }, { opacity: 1, position: 1 }], roughness: 50, randomSeed: 1, colorModel: 'rgb', restrictColors: false, addTransparency: false, min: [0, 0, 0, 0], max: [1, 1, 1, 1] },
  patternOverlay: { enabled: false, opacity: 100, scale: 100, blendMode: 'normal', id: '', name: 'Pattern', phase: { x: 0, y: 0 }, linked: true },
  stroke: {
    enabled: false, color: '#ffffff', opacity: 100, size: 3, position: 'outside', blendMode: 'normal', fillType: 'color',
    gradient: { angle: 90, scale: 100, style: 'linear', reverse: false, name: 'Foreground to background', gradientType: 'solid', colorStops: [{ color: '#000000', position: 0 }, { color: '#ffffff', position: 1 }], opacityStops: [{ opacity: 1, position: 0 }, { opacity: 1, position: 1 }], roughness: 50, randomSeed: 1, colorModel: 'rgb', restrictColors: false, addTransparency: false, min: [0, 0, 0, 0], max: [1, 1, 1, 1] },
    pattern: { scale: 100, id: '', name: 'Pattern', phase: { x: 0, y: 0 }, linked: true },
  },
}

export function normalizeLayerEffects(effects?: Partial<LayerEffects> | null): LayerEffects {
  return {
    dropShadow: { ...defaultLayerEffects.dropShadow, ...effects?.dropShadow },
    innerShadow: { ...defaultLayerEffects.innerShadow, ...effects?.innerShadow },
    outerGlow: { ...defaultLayerEffects.outerGlow, ...effects?.outerGlow },
    innerGlow: { ...defaultLayerEffects.innerGlow, ...effects?.innerGlow },
    bevel: { ...defaultLayerEffects.bevel, ...effects?.bevel },
    satin: { ...defaultLayerEffects.satin, ...effects?.satin },
    colorOverlay: { ...defaultLayerEffects.colorOverlay, ...effects?.colorOverlay },
    gradientOverlay: { ...defaultLayerEffects.gradientOverlay, ...effects?.gradientOverlay },
    patternOverlay: { ...defaultLayerEffects.patternOverlay, ...effects?.patternOverlay },
    stroke: {
      ...defaultLayerEffects.stroke,
      ...effects?.stroke,
      gradient: { ...defaultLayerEffects.stroke.gradient, ...effects?.stroke?.gradient },
      pattern: { ...defaultLayerEffects.stroke.pattern, ...effects?.stroke?.pattern },
    },
  }
}

export function hasEnabledLayerEffects(effects?: Partial<LayerEffects> | null) {
  const value = normalizeLayerEffects(effects)
  return Object.values(value).some((effect) => effect.enabled)
}
