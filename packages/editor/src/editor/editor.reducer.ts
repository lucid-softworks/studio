import { getCanvasPreset, initialDocument } from './presets'
import type { DocumentAction, EditorDocument, EditorLayer, HistoryAction, HistoryState } from './types'

type LayerBlock = { groupId: string | null; layers: EditorLayer[] }

function stackBlocks(layers: EditorLayer[]) {
  const seenGroups = new Set<string>()
  const blocks: LayerBlock[] = []
  for (const layer of layers) {
    if (!layer.groupId) {
      blocks.push({ groupId: null, layers: [layer] })
      continue
    }
    if (seenGroups.has(layer.groupId)) continue
    seenGroups.add(layer.groupId)
    blocks.push({ groupId: layer.groupId, layers: layers.filter((candidate) => candidate.groupId === layer.groupId) })
  }
  return blocks
}

function moveBlock(layers: EditorLayer[], groupId: string | null, layerId: string | null, direction: 'up' | 'down') {
  const blocks = stackBlocks(layers)
  const index = blocks.findIndex((block) => groupId ? block.groupId === groupId : block.groupId === null && block.layers[0]?.id === layerId)
  const target = direction === 'up' ? index + 1 : index - 1
  if (index < 0 || target < 0 || target >= blocks.length) return layers
  ;[blocks[index], blocks[target]] = [blocks[target], blocks[index]]
  return blocks.flatMap((block) => block.layers)
}

export function documentReducer(state: EditorDocument, action: DocumentAction): EditorDocument {
  switch (action.type) {
    case 'set-canvas-preset': {
      const preset = getCanvasPreset(action.value)
      return { ...state, canvasPreset: action.value, canvasSize: { width: preset.width, height: preset.height } }
    }
    case 'set-canvas-size':
      return { ...state, canvasPreset: 'custom', canvasSize: { width: action.width, height: action.height } }
    case 'set-background':
      return { ...state, background: { ...state.background, ...action.patch } }
    case 'set-pattern':
      return { ...state, pattern: { ...state.pattern, ...action.patch } }
    case 'add-layer': {
      const layer = state.selectedGroupId ? { ...action.layer, groupId: state.selectedGroupId } as EditorLayer : action.layer
      return { ...state, layers: [...state.layers, layer], selectedLayerId: layer.id, selectedLayerIds: [layer.id], selectedGroupId: null }
    }
    case 'add-group': {
      const ids = new Set(action.layerIds)
      const grouped = state.layers.filter((layer) => ids.has(layer.id)).map((layer) => ({ ...layer, groupId: action.group.id } as EditorLayer))
      const topIndex = Math.max(-1, ...state.layers.map((layer, index) => ids.has(layer.id) ? index : -1))
      const remaining = state.layers.filter((layer) => !ids.has(layer.id))
      const insertion = topIndex < 0 ? remaining.length : state.layers.slice(0, topIndex + 1).filter((layer) => !ids.has(layer.id)).length
      const layers = [...remaining.slice(0, insertion), ...grouped, ...remaining.slice(insertion)]
      return { ...state, groups: [...state.groups, action.group], layers, selectedGroupId: action.group.id, selectedLayerId: null, selectedLayerIds: grouped.map((layer) => layer.id) }
    }
    case 'update-layer':
      return {
        ...state,
        layers: state.layers.map((layer) =>
          layer.id === action.id ? ({ ...layer, ...action.patch } as EditorLayer) : layer,
        ),
      }
    case 'update-layers': {
      const changes = new Map(action.changes.map((change) => [change.id, change.patch]))
      return {
        ...state,
        layers: state.layers.map((layer) => {
          const patch = changes.get(layer.id)
          return patch ? ({ ...layer, ...patch } as EditorLayer) : layer
        }),
      }
    }
    case 'update-group':
      return { ...state, groups: state.groups.map((group) => group.id === action.id ? { ...group, ...action.patch } : group) }
    case 'remove-layer': {
      const index = state.layers.findIndex((layer) => layer.id === action.id)
      if (index < 0) return state
      const layers = state.layers.filter((layer) => layer.id !== action.id)
      const selectedLayerIds = state.selectedLayerIds.filter((id) => id !== action.id)
      const nextSelection = state.selectedLayerId === action.id
        ? (layers[index] ?? layers[index - 1] ?? null)?.id ?? null
        : state.selectedLayerId
      return { ...state, layers, selectedLayerId: nextSelection, selectedLayerIds: nextSelection && selectedLayerIds.length === 0 ? [nextSelection] : selectedLayerIds, selectedGroupId: null }
    }
    case 'remove-layers': {
      const ids = new Set(action.ids)
      const layers = state.layers.filter((layer) => !ids.has(layer.id))
      const selectedLayerId = layers.findLast((layer) => state.selectedLayerIds.includes(layer.id))?.id ?? null
      return { ...state, layers, selectedLayerId, selectedLayerIds: selectedLayerId ? [selectedLayerId] : [], selectedGroupId: null }
    }
    case 'remove-group': {
      const children = state.layers.filter((layer) => layer.groupId === action.id)
      const layers = action.deleteLayers
        ? state.layers.filter((layer) => layer.groupId !== action.id)
        : state.layers.map((layer) => layer.groupId === action.id ? { ...layer, groupId: null } as EditorLayer : layer)
      const removedIds = new Set(children.map((layer) => layer.id))
      const selectedLayerIds = action.deleteLayers ? state.selectedLayerIds.filter((id) => !removedIds.has(id)) : state.selectedLayerIds
      const selectedLayerId = state.selectedLayerId && selectedLayerIds.includes(state.selectedLayerId) ? state.selectedLayerId : null
      return { ...state, groups: state.groups.filter((group) => group.id !== action.id), layers, selectedGroupId: null, selectedLayerId, selectedLayerIds }
    }
    case 'select-layer': {
      if (!action.id) return state.selectedLayerIds.length === 0 && !state.selectedGroupId ? state : { ...state, selectedLayerId: null, selectedLayerIds: [], selectedGroupId: null }
      const mode = action.mode ?? 'replace'
      if (mode === 'replace') {
        return state.selectedLayerIds.length === 1 && state.selectedLayerId === action.id && !state.selectedGroupId
          ? state
          : { ...state, selectedLayerId: action.id, selectedLayerIds: [action.id], selectedGroupId: null }
      }
      const exists = state.selectedLayerIds.includes(action.id)
      const selectedLayerIds = mode === 'toggle'
        ? (exists ? state.selectedLayerIds.filter((id) => id !== action.id) : [...state.selectedLayerIds, action.id])
        : (exists ? state.selectedLayerIds : [...state.selectedLayerIds, action.id])
      return { ...state, selectedLayerIds, selectedLayerId: exists && mode === 'toggle' ? (selectedLayerIds.at(-1) ?? null) : action.id, selectedGroupId: null }
    }
    case 'select-group': {
      if (!action.id) return { ...state, selectedGroupId: null, selectedLayerId: null, selectedLayerIds: [] }
      const childIds = state.layers.filter((layer) => layer.groupId === action.id).map((layer) => layer.id)
      return { ...state, selectedGroupId: action.id, selectedLayerId: null, selectedLayerIds: childIds }
    }
    case 'move-layer': {
      const index = state.layers.findIndex((layer) => layer.id === action.id)
      if (index < 0) return state
      const layer = state.layers[index]
      if (!layer.groupId) return { ...state, layers: moveBlock(state.layers, null, layer.id, action.direction) }
      const members = state.layers.filter((candidate) => candidate.groupId === layer.groupId)
      const memberIndex = members.findIndex((candidate) => candidate.id === layer.id)
      const targetMember = action.direction === 'up' ? members[memberIndex + 1] : members[memberIndex - 1]
      if (!targetMember) return state
      const targetIndex = state.layers.findIndex((candidate) => candidate.id === targetMember.id)
      const layers = [...state.layers]
      ;[layers[index], layers[targetIndex]] = [layers[targetIndex], layers[index]]
      return { ...state, layers }
    }
    case 'move-group':
      return { ...state, layers: moveBlock(state.layers, action.id, null, action.direction) }
    case 'reset-document':
      return initialDocument
  }
}

export const initialHistoryState: HistoryState = {
  past: [],
  present: initialDocument,
  future: [],
  groupKey: null,
}

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'apply': {
      const present = documentReducer(state.present, action.action)
      if (present === state.present) return state
      if (action.record === false) return { ...state, present }

      if (action.groupKey && action.groupKey === state.groupKey) {
        return { ...state, present, future: [] }
      }

      return {
        past: [...state.past, state.present].slice(-60),
        present,
        future: [],
        groupKey: action.groupKey ?? null,
      }
    }
    case 'end-group':
      return state.groupKey ? { ...state, groupKey: null } : state
    case 'undo': {
      const previous = state.past.at(-1)
      if (!previous) return state
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future].slice(0, 60),
        groupKey: null,
      }
    }
    case 'redo': {
      const next = state.future[0]
      if (!next) return state
      return {
        past: [...state.past, state.present].slice(-60),
        present: next,
        future: state.future.slice(1),
        groupKey: null,
      }
    }
    case 'replace':
      return { past: [], present: action.document, future: [], groupKey: null }
    case 'discard-future':
      return state.future.length ? { ...state, future: [] } : state
  }
}
