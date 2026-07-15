import { describe, expect, it } from 'vitest'
import { defaultLayerEffects, normalizeLayerEffects } from '../effects'
import { defaultLayerFilters } from '../filters'
import { createAdjustmentLayer, createLayerGroup, createRasterLayer, createShapeLayer, initialDocument } from '../presets'
import { buildCompositionRenderPlan, buildNativeLayerCompositionPlan } from './render-plan'
import { typeGpuBlendModeCodes } from './typegpu-blend-modes'

describe('composition render plan', () => {
  it('captures masks, clipping, blend modes, filters, and effects deterministically', () => {
    const base = {
      ...createRasterLayer('base-asset', 'Base', 400, 300),
      id: 'base',
      stackOrder: 0,
    }
    const clipped = {
      ...createShapeLayer('rectangle', 0),
      id: 'clipped',
      stackOrder: 1,
      opacity: 75,
      blendMode: 'overlay' as const,
      clipToBelow: true,
      maskAssetId: 'shape-mask',
      filters: { ...defaultLayerFilters, contrast: 125, hue: 18 },
      effects: {
        ...defaultLayerEffects,
        dropShadow: { ...defaultLayerEffects.dropShadow, enabled: true, distance: 12 },
      },
    }
    const document = { ...initialDocument, layers: [base, clipped] }

    const first = buildCompositionRenderPlan(document)
    const second = buildCompositionRenderPlan(structuredClone(document))

    expect(first).toEqual(second)
    expect(first.nodes).toEqual([
      {
        kind: 'layer',
        layerId: 'base',
        layerType: 'raster',
        opacity: 100,
        blendMode: 'normal',
        maskAssetId: null,
        clipBaseLayerId: null,
        filters: null,
        effects: null,
      },
      {
        kind: 'layer',
        layerId: 'clipped',
        layerType: 'shape',
        opacity: 75,
        blendMode: 'overlay',
        maskAssetId: 'shape-mask',
        clipBaseLayerId: 'base',
        filters: clipped.filters,
        effects: normalizeLayerEffects(clipped.effects),
      },
    ])
  })

  it('describes pass-through and isolated group composition', () => {
    const passThrough = { ...createLayerGroup(0), id: 'pass', passThrough: true, stackOrder: 0 }
    const isolated = { ...createLayerGroup(1), id: 'isolated', opacity: 60, blendMode: 'multiply' as const, stackOrder: 1 }
    const passChild = { ...createShapeLayer('ellipse', 0), id: 'pass-child', groupId: passThrough.id, stackOrder: 0 }
    const isolatedChild = { ...createShapeLayer('rectangle', 1), id: 'isolated-child', groupId: isolated.id, stackOrder: 0 }

    const plan = buildCompositionRenderPlan({
      ...initialDocument,
      groups: [passThrough, isolated],
      layers: [passChild, isolatedChild],
    })

    expect(plan.nodes).toMatchObject([
      {
        kind: 'group',
        groupId: 'pass',
        isolated: false,
        opacity: 100,
        blendMode: 'normal',
        children: [{ kind: 'layer', layerId: 'pass-child' }],
      },
      {
        kind: 'group',
        groupId: 'isolated',
        isolated: true,
        opacity: 60,
        blendMode: 'multiply',
        children: [{ kind: 'layer', layerId: 'isolated-child' }],
      },
    ])
  })

  it('captures adjustment color transforms and excludes hidden operations', () => {
    const hiddenBase = { ...createRasterLayer('hidden-asset', 'Hidden', 100, 100), id: 'hidden', visible: false, stackOrder: 0 }
    const hiddenClipped = { ...createShapeLayer('rectangle', 0), id: 'hidden-clipped', clipToBelow: true, stackOrder: 1 }
    const adjustment = {
      ...createAdjustmentLayer(0),
      id: 'color-adjustment',
      stackOrder: 2,
      opacity: 85,
      blendMode: 'color' as const,
      brightness: 112,
      contrast: 94,
      saturation: 72,
      hue: -14,
      blur: 3,
    }

    const plan = buildCompositionRenderPlan({ ...initialDocument, layers: [hiddenBase, hiddenClipped, adjustment] })

    expect(plan.nodes).toEqual([{
      kind: 'adjustment',
      layerId: 'color-adjustment',
      opacity: 85,
      blendMode: 'color',
      brightness: 112,
      contrast: 94,
      saturation: 72,
      hue: -14,
      blur: 3,
    }])
  })

  it('flattens pass-through groups into native layer composition order', () => {
    const group = { ...createLayerGroup(0), id: 'pass', passThrough: true, stackOrder: 0 }
    const first = { ...createShapeLayer('rectangle', 0), id: 'first', groupId: group.id, stackOrder: 0 }
    const second = { ...createShapeLayer('ellipse', 1), id: 'second', groupId: group.id, stackOrder: 1 }

    const plan = buildNativeLayerCompositionPlan({
      ...initialDocument,
      groups: [group],
      layers: [first, second],
    })

    expect(plan?.layers.map((node) => node.kind === 'group' ? node.groupId : node.layerId)).toEqual(['first', 'second'])
  })

  it('keeps shadow and glow effects in the native composition plan', () => {
    const layer = { ...createShapeLayer('ellipse', 1), id: 'effects', effects: { ...defaultLayerEffects, dropShadow: { ...defaultLayerEffects.dropShadow, enabled: true }, outerGlow: { ...defaultLayerEffects.outerGlow, enabled: true } } }

    expect(buildNativeLayerCompositionPlan({ ...initialDocument, layers: [layer] })?.layers[0])
      .toMatchObject({ kind: 'layer', layerId: 'effects', effects: { dropShadow: { enabled: true }, outerGlow: { enabled: true } } })
  })

  it('keeps color overlay effects in the native composition plan', () => {
    const layer = { ...createShapeLayer('ellipse', 1), id: 'overlay', effects: { ...defaultLayerEffects, colorOverlay: { ...defaultLayerEffects.colorOverlay, enabled: true, color: '#ff3366', opacity: 72 } } }

    expect(buildNativeLayerCompositionPlan({ ...initialDocument, layers: [layer] })?.layers[0])
      .toMatchObject({ kind: 'layer', layerId: 'overlay', effects: { colorOverlay: { enabled: true, color: '#ff3366', opacity: 72 } } })
  })

  it('keeps color layer filters in the native composition plan', () => {
    const filtered = { ...createShapeLayer('ellipse', 1), id: 'filtered', filters: { ...defaultLayerFilters, contrast: 125, hue: 18, sepia: 40 } }

    expect(buildNativeLayerCompositionPlan({ ...initialDocument, layers: [filtered] })?.layers[0])
      .toMatchObject({ kind: 'layer', layerId: 'filtered', filters: { contrast: 125, hue: 18, sepia: 40 } })
  })

  it('keeps blur layer filters in the native composition plan', () => {
    const filtered = { ...createShapeLayer('ellipse', 1), id: 'filtered', filters: { ...defaultLayerFilters, blur: 8 } }

    expect(buildNativeLayerCompositionPlan({ ...initialDocument, layers: [filtered] })?.layers[0])
      .toMatchObject({ kind: 'layer', layerId: 'filtered', filters: { blur: 8 } })
  })

  it('keeps isolated groups as native texture composition passes', () => {
    const isolated = { ...createLayerGroup(0), id: 'isolated', opacity: 75, blendMode: 'multiply' as const, stackOrder: 0 }
    const child = { ...createShapeLayer('ellipse', 0), id: 'child', groupId: isolated.id, stackOrder: 0 }

    expect(buildNativeLayerCompositionPlan({ ...initialDocument, groups: [isolated], layers: [child] })?.layers[0])
      .toMatchObject({ kind: 'group', groupId: 'isolated', isolated: true, opacity: 75, blendMode: 'multiply', children: [{ layerId: 'child' }] })
  })

  it('keeps color-only adjustments in the native composition plan', () => {
    const adjustment = {
      ...createAdjustmentLayer(0),
      id: 'color-adjustment',
      opacity: 72,
      brightness: 115,
      contrast: 90,
      saturation: 80,
      hue: 24,
      blur: 0,
    }

    expect(buildNativeLayerCompositionPlan({ ...initialDocument, layers: [adjustment] })?.layers[0])
      .toMatchObject({ kind: 'adjustment', layerId: 'color-adjustment', opacity: 72, brightness: 115, hue: 24 })
  })

  it('keeps blur adjustments in the native composition plan', () => {
    const adjustment = { ...createAdjustmentLayer(0), id: 'blurred', blur: 7 }

    expect(buildNativeLayerCompositionPlan({ ...initialDocument, layers: [adjustment] })?.layers[0])
      .toMatchObject({ kind: 'adjustment', layerId: 'blurred', blur: 7 })
  })

  it('keeps raster masks in the native composition plan', () => {
    const masked = { ...createShapeLayer('rectangle', 0), id: 'masked', maskAssetId: 'mask' }

    expect(buildNativeLayerCompositionPlan({ ...initialDocument, layers: [masked] })?.layers[0])
      .toMatchObject({ layerId: 'masked', maskAssetId: 'mask' })
  })

  it('uses Canvas2D for advanced masks and Blend If until native shaders have parity', () => {
    const path = { ...createShapeLayer('rectangle', 0), id: 'path', vectorMask: { paths: [], density: 100, feather: 0, inverted: false, disabled: false, linked: true, fillStartsWithAllPixels: false } }
    const feathered = { ...createShapeLayer('rectangle', 1), id: 'feathered', maskAssetId: 'mask', maskSettings: { density: 75, feather: 2, linked: true } }
    const blendIf = { ...createShapeLayer('rectangle', 2), id: 'blend-if', blendIf: { source: [20, 40, 220, 240], destination: [0, 0, 255, 255], channels: [] } }

    expect(buildNativeLayerCompositionPlan({ ...initialDocument, layers: [path] })).toBeNull()
    expect(buildNativeLayerCompositionPlan({ ...initialDocument, layers: [feathered] })).toBeNull()
    expect(buildNativeLayerCompositionPlan({ ...initialDocument, layers: [blendIf] })).toBeNull()
  })

  it('keeps clipping layers in the native composition plan', () => {
    const base = { ...createShapeLayer('rectangle', 0), id: 'base', stackOrder: 0 }
    const clipped = { ...createShapeLayer('ellipse', 1), id: 'clipped', clipToBelow: true, stackOrder: 1 }

    expect(buildNativeLayerCompositionPlan({ ...initialDocument, layers: [base, clipped] })?.layers[1])
      .toMatchObject({ layerId: 'clipped', clipBaseLayerId: 'base' })
  })

  it('keeps separable blend modes in the native composition plan', () => {
    const blendModes = Object.keys(typeGpuBlendModeCodes) as Array<keyof typeof typeGpuBlendModeCodes>
    const layers = blendModes.map((blendMode, index) => ({
      ...createShapeLayer('rectangle', index),
      id: blendMode,
      blendMode,
      stackOrder: index,
    }))

    expect(buildNativeLayerCompositionPlan({ ...initialDocument, layers })?.layers.map((layer) => layer.blendMode))
      .toEqual(blendModes)
  })
})
