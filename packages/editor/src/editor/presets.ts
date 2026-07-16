import { EDITOR_DOCUMENT_SCHEMA_VERSION, type AdjustmentLayer, type EditorDocument, type EditorLayer, type ImageLayer, type LayerGroup, type RasterLayer, type ShapeKind, type ShapeLayer, type SmartObjectLayer, type SmartObjectSource, type TextLayer } from './types'

export const canvasPresets = [
  { id: 'landscape', label: 'Landscape', shortLabel: '16:10', width: 1600, height: 1000 },
  { id: 'square', label: 'Square', shortLabel: '1:1', width: 1200, height: 1200 },
  { id: 'portrait', label: 'Portrait', shortLabel: '4:5', width: 1080, height: 1350 },
  { id: 'wide', label: 'Wide', shortLabel: '16:9', width: 1600, height: 900 },
] as const

export const backgroundPresets = [
  { id: 'nightfall', name: 'Nightfall', colors: ['#17152f', '#5940c8'] as [string, string] },
  { id: 'lagoon', name: 'Lagoon', colors: ['#0b3c49', '#0ea5a4'] as [string, string] },
  { id: 'sorbet', name: 'Sorbet', colors: ['#fb7185', '#f59e0b'] as [string, string] },
  { id: 'ultraviolet', name: 'Ultraviolet', colors: ['#4c1d95', '#db2777'] as [string, string] },
  { id: 'glacier', name: 'Glacier', colors: ['#e0f2fe', '#60a5fa'] as [string, string] },
  { id: 'graphite', name: 'Graphite', colors: ['#09090b', '#3f3f46'] as [string, string] },
] as const

export const initialDocument: EditorDocument = {
  schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
  bitDepth: 8,
  canvasPreset: 'landscape',
  canvasSize: { width: 1600, height: 1000 },
  background: {
    kind: 'transparent',
    gradient: ['#17152f', '#5940c8'],
    solidColor: '#27272a',
    gradientAngle: 135,
    imageAssetId: null,
    imageBlur: 8,
    imageOverlay: 24,
  },
  pattern: {
    kind: 'none',
    color: '#ffffff',
    opacity: 16,
    size: 40,
  },
  groups: [],
  layers: [],
  selectedLayerId: null,
  selectedLayerIds: [],
  selectedGroupId: null,
}

export function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const layerBase = (name: string) => ({
  id: createId(),
  name,
  visible: true,
  locked: false,
  opacity: 100,
  position: { x: 0, y: 0 },
  rotation: 0,
})

export function createImageLayer(assetId: string, name: string): ImageLayer {
  return {
    ...layerBase(name),
    type: 'image',
    assetId,
    padding: 12,
    scale: 100,
    cornerRadius: 18,
    shadow: 48,
    flipX: false,
    flipY: false,
  }
}

export function createRasterLayer(assetId: string, name: string, width: number, height: number, position = { x: 0, y: 0 }): RasterLayer {
  return {
    ...layerBase(name),
    type: 'raster',
    assetId,
    width,
    height,
    scale: 100,
    position,
  }
}

export function createSmartObjectLayer(assetId: string, name: string, width: number, height: number, source: SmartObjectSource, position = { x: 0, y: 0 }): SmartObjectLayer {
  return {
    ...layerBase(name),
    type: 'smart-object',
    assetId,
    width,
    height,
    scale: 100,
    position,
    source,
    smartFilters: [],
  }
}

export function createTextLayer(index: number): TextLayer {
  return {
    ...layerBase(`Text ${index}`),
    type: 'text',
    text: 'Make something beautiful',
    color: '#ffffff',
    fontFamily: 'Inter',
    fontSize: 72,
    fontWeight: 700,
    textAlign: 'center',
    letterSpacing: 0,
  }
}

export function createShapeLayer(shape: ShapeKind, index: number): ShapeLayer {
  return {
    ...layerBase(`${shape === 'ellipse' ? 'Ellipse' : 'Rectangle'} ${index}`),
    type: 'shape',
    shape,
    width: shape === 'ellipse' ? 22 : 28,
    height: shape === 'ellipse' ? 22 : 18,
    fill: '#8b5cf6',
    stroke: '#ffffff',
    strokeWidth: 0,
    cornerRadius: 24,
  }
}

export function createAdjustmentLayer(index: number): AdjustmentLayer {
  return {
    id: createId(),
    type: 'adjustment',
    name: `Adjustment ${index + 1}`,
    visible: true,
    locked: false,
    opacity: 100,
    position: { x: 0, y: 0 },
    rotation: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    blur: 0,
  }
}

export function createLayerGroup(index: number): LayerGroup {
  return {
    id: createId(),
    name: `Group ${index + 1}`,
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    passThrough: false,
    collapsed: false,
  }
}

export function duplicateLayer(layer: EditorLayer): EditorLayer {
  return {
    ...layer,
    id: createId(),
    name: `${layer.name} copy`,
    position: { x: layer.position.x + 0.025, y: layer.position.y + 0.025 },
  }
}

export const getCanvasPreset = (id: string) =>
  canvasPresets.find((preset) => preset.id === id) ?? canvasPresets[0]

export const getDocumentSize = (document: Pick<EditorDocument, 'canvasPreset' | 'canvasSize'>) =>
  document.canvasPreset === 'custom' ? document.canvasSize : getCanvasPreset(document.canvasPreset)
