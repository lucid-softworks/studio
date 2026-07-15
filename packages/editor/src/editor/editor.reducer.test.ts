import { describe, expect, it } from 'vitest'
import { documentReducer, historyReducer, initialHistoryState } from './editor.reducer'
import { createAdjustmentLayer, createLayerGroup, initialDocument } from './presets'
import type { TextLayer } from './types'

const textLayer: TextLayer = {
  id: 'text-1',
  type: 'text',
  name: 'Heading',
  visible: true,
  locked: false,
  opacity: 100,
  position: { x: 0, y: 0 },
  rotation: 0,
  text: 'Hello',
  color: '#ffffff',
  fontSize: 72,
  fontWeight: 700,
  textAlign: 'center',
  letterSpacing: 0,
}

describe('documentReducer', () => {
  it('adds and selects a typed layer', () => {
    const next = documentReducer(initialDocument, { type: 'add-layer', layer: textLayer })
    expect(next.layers).toEqual([{ ...textLayer, groupId: null, stackOrder: 0 }])
    expect(next.selectedLayerId).toBe(textLayer.id)
  })

  it('updates nested background settings without replacing the rest', () => {
    const next = documentReducer(initialDocument, { type: 'set-background', patch: { imageBlur: 20 } })
    expect(next.background.imageBlur).toBe(20)
    expect(next.background.gradient).toEqual(initialDocument.background.gradient)
  })

  it('supports custom document dimensions for opened image files', () => {
    const next = documentReducer(initialDocument, { type: 'set-canvas-size', width: 2048, height: 1365 })
    expect(next.canvasPreset).toBe('custom')
    expect(next.canvasSize).toEqual({ width: 2048, height: 1365 })
  })

  it('supports additive and toggle layer selection', () => {
    const second = { ...textLayer, id: 'text-2', name: 'Second' }
    const withLayers = { ...initialDocument, layers: [textLayer, second] }
    const firstSelected = documentReducer(withLayers, { type: 'select-layer', id: textLayer.id })
    const bothSelected = documentReducer(firstSelected, { type: 'select-layer', id: second.id, mode: 'add' })
    const toggled = documentReducer(bothSelected, { type: 'select-layer', id: textLayer.id, mode: 'toggle' })
    expect(bothSelected.selectedLayerIds).toEqual([textLayer.id, second.id])
    expect(toggled.selectedLayerIds).toEqual([second.id])
    expect(toggled.selectedLayerId).toBe(second.id)
  })

  it('updates multiple selected layers in one operation', () => {
    const second = { ...textLayer, id: 'text-2', name: 'Second' }
    const withLayers = { ...initialDocument, layers: [textLayer, second] }
    const next = documentReducer(withLayers, { type: 'update-layers', changes: [
      { id: textLayer.id, patch: { opacity: 50 } },
      { id: second.id, patch: { opacity: 75 } },
    ] })
    expect(next.layers.map((layer) => layer.opacity)).toEqual([50, 75])
  })

  it('adds stack adjustments and preserves clipping relationships', () => {
    const clipped = documentReducer({ ...initialDocument, layers: [textLayer] }, { type: 'update-layer', id: textLayer.id, patch: { clipToBelow: true } })
    const adjustment = createAdjustmentLayer(0)
    const next = documentReducer(clipped, { type: 'add-layer', layer: adjustment })
    expect(next.layers[0].clipToBelow).toBe(true)
    expect(next.layers[1]).toMatchObject({ type: 'adjustment', brightness: 100, saturation: 100, hue: 0 })
  })

  it('groups selected layers into a contiguous stack block', () => {
    const middle = { ...textLayer, id: 'middle', name: 'Middle' }
    const top = { ...textLayer, id: 'top', name: 'Top' }
    const state = { ...initialDocument, layers: [textLayer, middle, top], selectedLayerIds: [textLayer.id, top.id] }
    const group = { ...createLayerGroup(0), id: 'group-1' }
    const next = documentReducer(state, { type: 'add-group', group, layerIds: state.selectedLayerIds })
    expect(next.layers.map((layer) => layer.id)).toEqual(['middle', 'text-1', 'top'])
    expect(next.layers.filter((layer) => layer.groupId === group.id).map((layer) => layer.id)).toEqual(['text-1', 'top'])
    expect(next.selectedGroupId).toBe(group.id)
  })

  it('moves and ungroups folders without scrambling their children', () => {
    const second = { ...textLayer, id: 'second', name: 'Second', groupId: 'group-1' }
    const first = { ...textLayer, groupId: 'group-1' }
    const loose = { ...textLayer, id: 'loose', name: 'Loose' }
    const group = { ...createLayerGroup(0), id: 'group-1' }
    const state = { ...initialDocument, groups: [group], layers: [first, second, loose] }
    const moved = documentReducer(state, { type: 'move-group', id: group.id, direction: 'up' })
    const ungrouped = documentReducer(moved, { type: 'remove-group', id: group.id })
    expect(moved.layers.map((layer) => layer.id)).toEqual(['loose', 'text-1', 'second'])
    expect(ungrouped.layers.map((layer) => layer.groupId ?? null)).toEqual([null, null, null])
  })

  it('supports nested folders and prevents hierarchy cycles', () => {
    const parent = { ...createLayerGroup(0), id: 'parent', stackOrder: 0 }
    const child = { ...createLayerGroup(1), id: 'child', parentId: parent.id, stackOrder: 0 }
    const nestedLayer = { ...textLayer, groupId: child.id, stackOrder: 0 }
    const state = { ...initialDocument, groups: [parent, child], layers: [nestedLayer] }

    const selected = documentReducer(state, { type: 'select-group', id: parent.id })
    const rejectedCycle = documentReducer(state, { type: 'move-stack-item', itemType: 'group', id: parent.id, parentId: child.id })
    const movedToRoot = documentReducer(state, { type: 'move-stack-item', itemType: 'layer', id: nestedLayer.id, parentId: null })

    expect(selected.selectedLayerIds).toEqual([nestedLayer.id])
    expect(rejectedCycle).toBe(state)
    expect(movedToRoot.layers[0]).toMatchObject({ id: nestedLayer.id, groupId: null })
  })

  it('ungroups a nested folder into its parent and preserves child order', () => {
    const parent = { ...createLayerGroup(0), id: 'parent', stackOrder: 0 }
    const child = { ...createLayerGroup(1), id: 'child', parentId: parent.id, stackOrder: 0 }
    const bottom = { ...textLayer, id: 'bottom', groupId: child.id, stackOrder: 0 }
    const top = { ...textLayer, id: 'top', groupId: child.id, stackOrder: 1 }
    const state = { ...initialDocument, groups: [parent, child], layers: [bottom, top] }
    const next = documentReducer(state, { type: 'remove-group', id: child.id })

    expect(next.groups.map((group) => group.id)).toEqual([parent.id])
    expect(next.layers.map((layer) => [layer.id, layer.groupId])).toEqual([['bottom', parent.id], ['top', parent.id]])
  })
})

describe('historyReducer', () => {
  it('groups continuous changes into one undo step', () => {
    const added = historyReducer(initialHistoryState, { type: 'apply', action: { type: 'add-layer', layer: textLayer } })
    const first = historyReducer(added, { type: 'apply', action: { type: 'update-layer', id: textLayer.id, patch: { fontSize: 80 } }, groupKey: 'font-size' })
    const second = historyReducer(first, { type: 'apply', action: { type: 'update-layer', id: textLayer.id, patch: { fontSize: 96 } }, groupKey: 'font-size' })
    const undone = historyReducer(second, { type: 'undo' })

    expect(second.past).toHaveLength(2)
    expect((undone.present.layers[0] as TextLayer).fontSize).toBe(72)
  })

  it('supports redo after undo', () => {
    const changed = historyReducer(initialHistoryState, { type: 'apply', action: { type: 'set-canvas-preset', value: 'square' } })
    const undone = historyReducer(changed, { type: 'undo' })
    const redone = historyReducer(undone, { type: 'redo' })
    expect(redone.present.canvasPreset).toBe('square')
  })
})
