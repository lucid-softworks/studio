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

    expect(plan?.layers.map((layer) => layer.layerId)).toEqual(['first', 'second'])
  })

  it('keeps unsupported composition features on the compatibility renderer', () => {
    const adjusted = { ...createShapeLayer('rectangle', 0), id: 'adjusted', blendMode: 'hue' as const }
    const filtered = { ...createShapeLayer('ellipse', 1), id: 'filtered', filters: defaultLayerFilters }
    const isolated = { ...createLayerGroup(0), id: 'isolated', opacity: 75, stackOrder: 2 }

    expect(buildNativeLayerCompositionPlan({ ...initialDocument, layers: [adjusted] })).toBeNull()
    expect(buildNativeLayerCompositionPlan({ ...initialDocument, layers: [filtered] })).toBeNull()
    expect(buildNativeLayerCompositionPlan({ ...initialDocument, groups: [isolated] })).toBeNull()
  })

  it('keeps raster masks in the native composition plan', () => {
    const masked = { ...createShapeLayer('rectangle', 0), id: 'masked', maskAssetId: 'mask' }

    expect(buildNativeLayerCompositionPlan({ ...initialDocument, layers: [masked] })?.layers[0])
      .toMatchObject({ layerId: 'masked', maskAssetId: 'mask' })
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
