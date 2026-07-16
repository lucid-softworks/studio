import { defaultLayerEffects } from './effects'
import { defaultLayerFilters } from './filters'
import { createAdjustmentLayer, createLayerGroup, createShapeLayer, createTextLayer, initialDocument } from './presets'
import type { AnimationKeyframe, BlendMode, EditorDocument, LayerGroup, ShapeLayer } from './types'

export type PerformanceFixtureId = '2k' | '4k' | '8k' | 'deep-layers' | 'high-depth' | 'animation' | 'renderer-native-8' | 'renderer-native-16' | 'renderer-native-32' | 'renderer-compat-16'

export type PerformanceFixture = {
  id: PerformanceFixtureId
  label: string
  purpose: string
  document: EditorDocument
}

type FixtureDefinition = {
  label: string
  purpose: string
  width: number
  height: number
  layers: number
  groups?: number
  bitDepth?: EditorDocument['bitDepth']
  animation?: boolean
}

export const performanceFixtureDefinitions: Record<PerformanceFixtureId, FixtureDefinition> = {
  '2k': { label: '2K composition', purpose: 'Common interactive editing baseline', width: 2560, height: 1440, layers: 12 },
  '4k': { label: '4K composition', purpose: 'Large display and export baseline', width: 3840, height: 2160, layers: 24 },
  '8k': { label: '8K composition', purpose: 'Large-document memory and render stress', width: 7680, height: 4320, layers: 48 },
  'deep-layers': { label: 'Deep layer stack', purpose: 'Layer traversal, panel, cache, and save stress', width: 2560, height: 1440, layers: 512, groups: 32 },
  'high-depth': { label: 'High-depth composition', purpose: '32-bit precision and texture-memory stress', width: 4096, height: 2160, layers: 24, bitDepth: 32 },
  animation: { label: 'Animation timeline', purpose: 'Timeline playback, interpolation, and export stress', width: 1920, height: 1080, layers: 120, groups: 12, animation: true },
  'renderer-native-8': { label: 'Native renderer features · 8-bit', purpose: 'Canvas2D and TypeGPU feature parity', width: 1600, height: 1000, layers: 26, groups: 2, bitDepth: 8 },
  'renderer-native-16': { label: 'Native renderer features · 16-bit', purpose: 'Canvas2D and TypeGPU 16-bit preview parity', width: 1600, height: 1000, layers: 26, groups: 2, bitDepth: 16 },
  'renderer-native-32': { label: 'Native renderer features · 32-bit', purpose: 'Canvas2D and TypeGPU 32-bit preview parity', width: 1600, height: 1000, layers: 26, groups: 2, bitDepth: 32 },
  'renderer-compat-16': { label: 'Canvas compatibility features · 16-bit', purpose: 'Advanced Canvas2D compatibility feature coverage', width: 1600, height: 1000, layers: 9, bitDepth: 16 },
}

const blendModes: ShapeLayer['blendMode'][] = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'difference']
const allBlendModes: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']

export const nativeRendererFeatureIds = [
  'background-gradient', 'document-pattern', 'all-blend-modes', 'layer-opacity', 'layer-filters', 'drop-shadow', 'outer-glow', 'color-overlay',
  'clipping-stack', 'pass-through-group', 'isolated-group', 'basic-adjustment', 'brightness-contrast-adjustment', 'hue-saturation-adjustment',
] as const

export const compatibilityRendererFeatureIds = [
  'artboards', 'compound-paths', 'gradient-fill', 'pattern-fill', 'advanced-stroke', 'advanced-layer-effects', 'geometry-transform', 'text-layout', 'filter-graph',
] as const

function rendererGroups(id: PerformanceFixtureId) {
  return [
    { ...createLayerGroup(0), id: `${id}-pass`, name: 'Feature · pass-through-group', passThrough: true, stackOrder: 23 },
    { ...createLayerGroup(1), id: `${id}-isolated`, name: 'Feature · isolated-group', opacity: 72, blendMode: 'multiply' as const, stackOrder: 24 },
  ]
}

function nativeRendererLayers(id: PerformanceFixtureId, groups: LayerGroup[]) {
  const base = { ...createShapeLayer('rectangle', 0), id: `${id}-base`, name: 'Feature · background-gradient · document-pattern', width: 92, height: 88, fill: '#24304a', strokeWidth: 0, position: { x: 0, y: 0 }, stackOrder: 0 }
  const blendTiles = allBlendModes.map((blendMode, index) => ({
    ...createShapeLayer(index % 2 ? 'ellipse' : 'rectangle', index + 1),
    id: `${id}-blend-${blendMode}`,
    name: `Feature · all-blend-modes · ${blendMode}`,
    width: 15,
    height: 13,
    cornerRadius: 18,
    fill: `hsl(${(index * 43 + 12) % 360} 82% 58%)`,
    opacity: 48 + index * 3,
    blendMode,
    position: { x: -0.36 + (index % 4) * 0.24, y: -0.32 + Math.floor(index / 4) * 0.18 },
    stackOrder: index + 1,
  }))
  const filtered = { ...createShapeLayer('ellipse', 18), id: `${id}-filters`, name: 'Feature · layer-filters · layer-opacity', width: 19, height: 19, fill: '#38bdf8', opacity: 78, position: { x: -0.32, y: 0.38 }, filters: { ...defaultLayerFilters, brightness: 118, contrast: 132, saturation: 72, hue: 24, sepia: 18, blur: 2 }, stackOrder: 17 }
  const effects = { ...createShapeLayer('rectangle', 19), id: `${id}-effects`, name: 'Feature · drop-shadow · outer-glow · color-overlay', width: 20, height: 16, fill: '#8b5cf6', position: { x: -0.08, y: 0.38 }, effects: { ...defaultLayerEffects, dropShadow: { ...defaultLayerEffects.dropShadow, enabled: true, distance: 12, blur: 18 }, outerGlow: { ...defaultLayerEffects.outerGlow, enabled: true, color: '#22d3ee', size: 14 }, colorOverlay: { ...defaultLayerEffects.colorOverlay, enabled: true, color: '#f472b6', opacity: 38 } }, stackOrder: 18 }
  const clipBase = { ...createShapeLayer('rectangle', 20), id: `${id}-clip-base`, name: 'Feature · clipping-stack · base', width: 20, height: 18, fill: '#facc15', position: { x: 0.17, y: 0.38 }, stackOrder: 19 }
  const clipped = { ...createShapeLayer('ellipse', 21), id: `${id}-clipped`, name: 'Feature · clipping-stack · clipped', width: 28, height: 13, fill: '#ef4444', position: { x: 0.17, y: 0.38 }, clipToBelow: true, blendMode: 'multiply' as const, stackOrder: 20 }
  const passChild = { ...createShapeLayer('ellipse', 22), id: `${id}-pass-child`, name: 'Feature · pass-through-group', width: 15, height: 15, fill: '#34d399', position: { x: 0.4, y: 0.33 }, groupId: groups[0].id, stackOrder: 0 }
  const isolatedChild = { ...createShapeLayer('rectangle', 23), id: `${id}-isolated-child`, name: 'Feature · isolated-group', width: 16, height: 17, fill: '#fb7185', position: { x: 0.4, y: 0.45 }, groupId: groups[1].id, stackOrder: 0 }
  const basicAdjustment = { ...createAdjustmentLayer(0), id: `${id}-adjust-basic`, name: 'Feature · basic-adjustment', brightness: 104, contrast: 108, saturation: 96, hue: 4, opacity: 70, stackOrder: 25 }
  const brightnessAdjustment = { ...createAdjustmentLayer(1), id: `${id}-adjust-brightness`, name: 'Feature · brightness-contrast-adjustment', adjustment: { type: 'brightness/contrast' as const, brightness: 4, contrast: 7, useLegacy: false, labColorOnly: false, auto: false }, opacity: 65, stackOrder: 26 }
  const hueAdjustment = { ...createAdjustmentLayer(2), id: `${id}-adjust-hue`, name: 'Feature · hue-saturation-adjustment', adjustment: { type: 'hue/saturation' as const, master: { range: [0, 0, 360, 360] as [number, number, number, number], hue: 3, saturation: 4, lightness: 0 } }, opacity: 50, stackOrder: 27 }
  return [base, ...blendTiles, filtered, effects, clipBase, clipped, passChild, isolatedChild, basicAdjustment, brightnessAdjustment, hueAdjustment]
}

function rectanglePath(left: number, top: number, right: number, bottom: number, operation: 'combine' | 'subtract') {
  return { closed: true, operation, fillRule: 'non-zero' as const, knots: [[left, top], [right, top], [right, bottom], [left, bottom]].map(([x, y]) => ({ linked: true, in: { x, y }, anchor: { x, y }, out: { x, y } })) }
}

function compatibilityRendererLayers(id: PerformanceFixtureId) {
  const base = { ...createShapeLayer('rectangle', 0), id: `${id}-base`, name: 'Feature · artboards', width: 96, height: 92, fill: '#18181b', stackOrder: 0 }
  const compound = { ...createShapeLayer('path', 1), id: `${id}-compound`, name: 'Feature · compound-paths', width: 28, height: 32, fill: '#f43f5e', position: { x: -0.33, y: -0.24 }, vectorPaths: [rectanglePath(0.05, 0.05, 0.95, 0.95, 'combine'), rectanglePath(0.32, 0.32, 0.68, 0.68, 'subtract')], stackOrder: 1 }
  const gradient = { ...createShapeLayer('ellipse', 2), id: `${id}-gradient`, name: 'Feature · gradient-fill', width: 27, height: 28, position: { x: 0, y: -0.24 }, fillStyle: { type: 'gradient' as const, name: 'Parity spectrum', style: 'radial' as const, angle: 35, scale: 110, colorStops: [{ color: '#22d3ee', position: 0 }, { color: '#7c3aed', position: 0.55 }, { color: '#f43f5e', position: 1 }], opacityStops: [{ opacity: 1, position: 0 }, { opacity: 0.75, position: 1 }] }, stackOrder: 2 }
  const pattern = { ...createShapeLayer('rectangle', 3), id: `${id}-pattern`, name: 'Feature · pattern-fill · advanced-stroke', width: 27, height: 28, position: { x: 0.33, y: -0.24 }, fill: '#172554', stroke: '#67e8f9', strokeWidth: 7, fillStyle: { type: 'pattern' as const, id: 'feature-dots', name: 'Feature dots', scale: 125, linked: false, phase: { x: 4, y: 7 } }, strokeStyle: { alignment: 'outside' as const, cap: 'round' as const, join: 'bevel' as const, miterLimit: 4, dashOffset: 3, dashes: [14, 8], opacity: 0.82, blendMode: 'screen' as const }, stackOrder: 3 }
  const effects = { ...createShapeLayer('ellipse', 4), id: `${id}-advanced-effects`, name: 'Feature · advanced-layer-effects', width: 22, height: 22, position: { x: -0.32, y: 0.25 }, fill: '#a78bfa', effects: { ...defaultLayerEffects, innerShadow: { ...defaultLayerEffects.innerShadow, enabled: true }, innerGlow: { ...defaultLayerEffects.innerGlow, enabled: true }, bevel: { ...defaultLayerEffects.bevel, enabled: true }, satin: { ...defaultLayerEffects.satin, enabled: true }, gradientOverlay: { ...defaultLayerEffects.gradientOverlay, enabled: true, opacity: 55 }, stroke: { ...defaultLayerEffects.stroke, enabled: true, size: 8, fillType: 'gradient' as const } }, stackOrder: 4 }
  const transformed = { ...createShapeLayer('rectangle', 5), id: `${id}-geometry`, name: 'Feature · geometry-transform', width: 23, height: 20, position: { x: -0.04, y: 0.25 }, fill: '#f59e0b', geometryTransform: { skewX: 8, skewY: -5, perspectiveX: 0.08, perspectiveY: -0.04, corners: [{ x: -0.05, y: 0 }, { x: 0.03, y: 0.04 }, { x: 0, y: -0.03 }, { x: 0.06, y: 0 }] as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }], interpolation: 'bicubic' as const, referencePoint: { x: 0.5, y: 0.5 } }, stackOrder: 5 }
  const text = { ...createTextLayer(0), id: `${id}-text`, name: 'Feature · text-layout', text: 'Studio\n16-bit', fontSize: 52, leading: 58, letterSpacing: 2, color: '#e0f2fe', position: { x: 0.3, y: 0.23 }, paragraphBox: { width: 280, height: 140 }, styleRuns: [{ start: 0, length: 6, fontFamily: 'Arial', fontSize: 52, fontWeight: 700 as const, color: '#67e8f9', letterSpacing: 2 }, { start: 7, length: 6, fontFamily: 'Arial', fontSize: 40, fontWeight: 600 as const, color: '#f0abfc', letterSpacing: 1 }], stackOrder: 6 }
  const filterGraph = { ...createShapeLayer('rectangle', 7), id: `${id}-filter-graph`, name: 'Feature · filter-graph', width: 18, height: 12, position: { x: 0.02, y: 0.43 }, fill: '#4ade80', filterGraph: [{ id: `${id}-emboss`, kind: 'emboss' as const, enabled: true, amount: 65, size: 3, seed: 4 }, { id: `${id}-noise`, kind: 'noise' as const, enabled: true, amount: 12, size: 1, seed: 7 }], stackOrder: 7 }
  const adjustment = { ...createAdjustmentLayer(0), id: `${id}-curves`, name: 'Feature · advanced-adjustment', adjustment: { type: 'curves' as const, rgb: [{ input: 0, output: 0 }, { input: 0.45, output: 0.56 }, { input: 1, output: 1 }] }, opacity: 72, stackOrder: 8 }
  return [base, compound, gradient, pattern, effects, transformed, text, filterGraph, adjustment]
}

function fixtureGroups(id: PerformanceFixtureId, count: number): LayerGroup[] {
  return Array.from({ length: count }, (_, index) => ({
    ...createLayerGroup(index),
    id: `fixture-${id}-group-${index}`,
    name: `Fixture group ${index + 1}`,
    parentId: index > 0 && index % 4 !== 0 ? `fixture-${id}-group-${index - 1}` : null,
    stackOrder: index * 100,
  }))
}

function fixtureLayers(id: PerformanceFixtureId, count: number, groups: LayerGroup[]): ShapeLayer[] {
  return Array.from({ length: count }, (_, index) => ({
    ...createShapeLayer(index % 3 === 0 ? 'ellipse' : 'rectangle', index),
    id: `fixture-${id}-layer-${index}`,
    name: `Fixture layer ${index + 1}`,
    width: 8 + (index % 8) * 4,
    height: 8 + (index % 6) * 5,
    position: { x: ((index * 37) % 100) / 100 - 0.5, y: ((index * 61) % 100) / 100 - 0.5 },
    rotation: (index * 17) % 360,
    opacity: 35 + (index % 66),
    blendMode: blendModes[index % blendModes.length],
    groupId: groups.length ? groups[index % groups.length].id : null,
    stackOrder: index,
    fill: `hsl(${(index * 47) % 360} 72% 55%)`,
  }))
}

function fixtureAnimation(id: PerformanceFixtureId, layers: ShapeLayer[]): EditorDocument['animation'] {
  const keyframes: AnimationKeyframe[] = layers.flatMap((layer, index) => [
    { id: `fixture-${id}-key-${index}-start`, layerId: layer.id, time: 0, position: layer.position, rotation: layer.rotation, opacity: layer.opacity },
    { id: `fixture-${id}-key-${index}-end`, layerId: layer.id, time: 10, position: { x: -layer.position.x, y: -layer.position.y }, rotation: layer.rotation + 180, opacity: 100 - layer.opacity },
  ])
  return { mode: 'timeline', fps: 30, duration: 10, loop: true, onionSkin: false, frames: [], keyframes }
}

export function createPerformanceFixture(id: PerformanceFixtureId): PerformanceFixture {
  const definition = performanceFixtureDefinitions[id]
  const nativeRendererFixture = id.startsWith('renderer-native')
  const compatibilityRendererFixture = id === 'renderer-compat-16'
  const groups = nativeRendererFixture ? rendererGroups(id) : fixtureGroups(id, definition.groups ?? 0)
  const layers: EditorDocument['layers'] = nativeRendererFixture ? nativeRendererLayers(id, groups) : compatibilityRendererFixture ? compatibilityRendererLayers(id) : fixtureLayers(id, definition.layers, groups)
  const document: EditorDocument = {
    ...structuredClone(initialDocument),
    canvasPreset: 'custom',
    canvasSize: { width: definition.width, height: definition.height },
    bitDepth: definition.bitDepth ?? 8,
    groups,
    layers,
    animation: definition.animation ? fixtureAnimation(id, layers.filter((layer): layer is ShapeLayer => layer.type === 'shape')) : undefined,
    selectedLayerId: nativeRendererFixture || compatibilityRendererFixture ? null : layers[0]?.id ?? null,
    selectedLayerIds: nativeRendererFixture || compatibilityRendererFixture || !layers[0] ? [] : [layers[0].id],
    ...(nativeRendererFixture || compatibilityRendererFixture ? {
      background: { ...structuredClone(initialDocument.background), kind: 'gradient' as const, gradient: ['#07111f', '#312e81'] as [string, string], gradientAngle: 128 },
      pattern: { kind: 'dots' as const, color: '#ffffff', opacity: 8, size: 30 },
    } : {}),
    ...(compatibilityRendererFixture ? { artboards: [{ id: `${id}-artboard`, name: 'Feature · artboards', x: 80, y: 70, width: 1440, height: 860, background: { kind: 'color' as const, color: '#111827' } }] } : {}),
  }
  return { id, label: definition.label, purpose: definition.purpose, document }
}

export const performanceFixtureIds = Object.keys(performanceFixtureDefinitions) as PerformanceFixtureId[]
