import { createLayerGroup, createShapeLayer, initialDocument } from './presets'
import type { AnimationKeyframe, EditorDocument, LayerGroup, ShapeLayer } from './types'

export type PerformanceFixtureId = '2k' | '4k' | '8k' | 'deep-layers' | 'high-depth' | 'animation'

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
}

const blendModes: ShapeLayer['blendMode'][] = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'difference']

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
  const groups = fixtureGroups(id, definition.groups ?? 0)
  const layers = fixtureLayers(id, definition.layers, groups)
  const document: EditorDocument = {
    ...structuredClone(initialDocument),
    canvasPreset: 'custom',
    canvasSize: { width: definition.width, height: definition.height },
    bitDepth: definition.bitDepth ?? 8,
    groups,
    layers,
    animation: definition.animation ? fixtureAnimation(id, layers) : undefined,
    selectedLayerId: layers[0]?.id ?? null,
    selectedLayerIds: layers[0] ? [layers[0].id] : [],
  }
  return { id, label: definition.label, purpose: definition.purpose, document }
}

export const performanceFixtureIds = Object.keys(performanceFixtureDefinitions) as PerformanceFixtureId[]
