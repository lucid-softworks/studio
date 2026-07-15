import type { LayerFilters } from './types'

export const defaultLayerFilters: LayerFilters = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  grayscale: 0,
  sepia: 0,
  invert: 0,
  blur: 0,
}

export function normalizeLayerFilters(filters?: Partial<LayerFilters>): LayerFilters {
  return { ...defaultLayerFilters, ...filters }
}

export function layerFilterCss(filters?: Partial<LayerFilters>) {
  const value = normalizeLayerFilters(filters)
  return `brightness(${value.brightness}%) contrast(${value.contrast}%) saturate(${value.saturation}%) hue-rotate(${value.hue}deg) grayscale(${value.grayscale}%) sepia(${value.sepia}%) invert(${value.invert}%) blur(${value.blur}px)`
}
