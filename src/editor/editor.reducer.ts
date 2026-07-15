import { getCanvasPreset, initialDocument } from './presets'
import type { DocumentAction, EditorDocument, EditorLayer, HistoryAction, HistoryState } from './types'

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
    case 'add-layer':
      return { ...state, layers: [...state.layers, action.layer], selectedLayerId: action.layer.id, selectedLayerIds: [action.layer.id] }
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
    case 'remove-layer': {
      const index = state.layers.findIndex((layer) => layer.id === action.id)
      if (index < 0) return state
      const layers = state.layers.filter((layer) => layer.id !== action.id)
      const selectedLayerIds = state.selectedLayerIds.filter((id) => id !== action.id)
      const nextSelection = state.selectedLayerId === action.id
        ? (layers[index] ?? layers[index - 1] ?? null)?.id ?? null
        : state.selectedLayerId
      return { ...state, layers, selectedLayerId: nextSelection, selectedLayerIds: nextSelection && selectedLayerIds.length === 0 ? [nextSelection] : selectedLayerIds }
    }
    case 'remove-layers': {
      const ids = new Set(action.ids)
      const layers = state.layers.filter((layer) => !ids.has(layer.id))
      const selectedLayerId = layers.findLast((layer) => state.selectedLayerIds.includes(layer.id))?.id ?? null
      return { ...state, layers, selectedLayerId, selectedLayerIds: selectedLayerId ? [selectedLayerId] : [] }
    }
    case 'select-layer': {
      if (!action.id) return state.selectedLayerIds.length === 0 ? state : { ...state, selectedLayerId: null, selectedLayerIds: [] }
      const mode = action.mode ?? 'replace'
      if (mode === 'replace') {
        return state.selectedLayerIds.length === 1 && state.selectedLayerId === action.id
          ? state
          : { ...state, selectedLayerId: action.id, selectedLayerIds: [action.id] }
      }
      const exists = state.selectedLayerIds.includes(action.id)
      const selectedLayerIds = mode === 'toggle'
        ? (exists ? state.selectedLayerIds.filter((id) => id !== action.id) : [...state.selectedLayerIds, action.id])
        : (exists ? state.selectedLayerIds : [...state.selectedLayerIds, action.id])
      return { ...state, selectedLayerIds, selectedLayerId: exists && mode === 'toggle' ? (selectedLayerIds.at(-1) ?? null) : action.id }
    }
    case 'move-layer': {
      const index = state.layers.findIndex((layer) => layer.id === action.id)
      const target = action.direction === 'up' ? index + 1 : index - 1
      if (index < 0 || target < 0 || target >= state.layers.length) return state
      const layers = [...state.layers]
      ;[layers[index], layers[target]] = [layers[target], layers[index]]
      return { ...state, layers }
    }
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
