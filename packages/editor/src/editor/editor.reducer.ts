import { getCanvasPreset, initialDocument } from './presets'
import { flattenStackLayers, getDescendantGroupIds, getGroupAncestors, getStackChildren } from './stack'
import type { DocumentAction, DocumentHistoryCommand, DocumentStatePatch, EditorDocument, EditorLayer, HistoryAction, HistoryState } from './types'

type StackRef = { type: 'layer' | 'group'; id: string }

function siblingRefs(state: EditorDocument, parentId: string | null): StackRef[] {
  return getStackChildren(state, parentId).map(({ type, id }) => ({ type, id }))
}

function assignSiblingOrders(state: EditorDocument, refs: StackRef[]) {
  const orders = new Map(refs.map((item, index) => [`${item.type}:${item.id}`, index]))
  return {
    ...state,
    layers: state.layers.map((layer) => orders.has(`layer:${layer.id}`) ? { ...layer, stackOrder: orders.get(`layer:${layer.id}`) } as EditorLayer : layer),
    groups: state.groups.map((group) => orders.has(`group:${group.id}`) ? { ...group, stackOrder: orders.get(`group:${group.id}`) } : group),
  }
}

function canonicalizeLayers(state: EditorDocument) {
  return { ...state, layers: flattenStackLayers(state) }
}

function itemParent(state: EditorDocument, item: StackRef) {
  return item.type === 'layer'
    ? state.layers.find((layer) => layer.id === item.id)?.groupId ?? null
    : state.groups.find((group) => group.id === item.id)?.parentId ?? null
}

function moveStackItem(state: EditorDocument, item: StackRef, parentId: string | null, beforeId?: string | null) {
  if (item.type === 'group') {
    if (item.id === parentId) return state
    if (parentId && getGroupAncestors(state, parentId).some((group) => group.id === item.id)) return state
  }
  const oldParentId = itemParent(state, item)
  const oldRefs = siblingRefs(state, oldParentId).filter((candidate) => candidate.id !== item.id)
  const targetRefs = (oldParentId === parentId ? oldRefs : siblingRefs(state, parentId).filter((candidate) => candidate.id !== item.id))
  const beforeIndex = beforeId ? targetRefs.findIndex((candidate) => candidate.id === beforeId) : -1
  targetRefs.splice(beforeIndex < 0 ? targetRefs.length : beforeIndex, 0, item)

  let next: EditorDocument = item.type === 'layer'
    ? { ...state, layers: state.layers.map((layer) => layer.id === item.id ? { ...layer, groupId: parentId } as EditorLayer : layer) }
    : { ...state, groups: state.groups.map((group) => group.id === item.id ? { ...group, parentId } : group) }
  if (oldParentId !== parentId) next = assignSiblingOrders(next, oldRefs)
  next = assignSiblingOrders(next, targetRefs)
  return canonicalizeLayers(next)
}

function moveWithinParent(state: EditorDocument, item: StackRef, direction: 'up' | 'down') {
  const parentId = itemParent(state, item)
  const refs = siblingRefs(state, parentId)
  const index = refs.findIndex((candidate) => candidate.type === item.type && candidate.id === item.id)
  const target = direction === 'up' ? index + 1 : index - 1
  if (index < 0 || target < 0 || target >= refs.length) return state
  ;[refs[index], refs[target]] = [refs[target], refs[index]]
  return canonicalizeLayers(assignSiblingOrders(state, refs))
}

export function documentReducer(state: EditorDocument, action: DocumentAction): EditorDocument {
  switch (action.type) {
    case 'set-bit-depth':
      return { ...state, bitDepth: action.bitDepth }
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
    case 'set-channels':
      return { ...state, channels: action.channels }
    case 'set-paths':
      return { ...state, paths: action.paths, selectedPathId: action.selectedPathId }
    case 'set-guides':
      return { ...state, guides: action.guides }
    case 'set-grid': {
      const grid = { ...(state.grid ?? { visible: false, spacing: 100, subdivisions: 4, color: '#38bdf8', snap: true }), ...action.patch }
      return { ...state, grid: { ...grid, spacing: Math.max(4, Math.min(2000, Number(grid.spacing) || 4)), subdivisions: Math.max(1, Math.min(10, Math.round(Number(grid.subdivisions) || 1))) } }
    }
    case 'set-artboards':
      return { ...state, artboards: action.artboards }
    case 'set-color-mode':
      return { ...state, colorMode: action.mode, indexedColors: action.indexedColors ?? state.indexedColors ?? 256 }
    case 'set-color-settings':
      return { ...state, colorSettings: { ...(state.colorSettings ?? { intent: 'relative', blackPointCompensation: true, proofEnabled: false, gamutWarning: false }), ...action.patch } }
    case 'set-animation':
      return { ...state, animation: action.animation }
    case 'set-slices':
      return { ...state, slices: action.slices }
    case 'set-file-metadata':
      return { ...state, fileMetadata: action.metadata }
    case 'set-print-settings':
      return { ...state, printSettings: action.settings }
    case 'set-measurements':
      return { ...state, measurements: action.measurements }
    case 'set-measurement-scale':
      return { ...state, measurementScale: action.scale }
    case 'set-color-samplers':
      return { ...state, colorSamplers: action.samplers }
    case 'replace-document':
      return action.document
    case 'add-layer': {
      const parentId = action.layer.groupId !== undefined ? action.layer.groupId : state.selectedGroupId ?? null
      const layer = { ...action.layer, groupId: parentId, stackOrder: siblingRefs(state, parentId).length } as EditorLayer
      const next = canonicalizeLayers({ ...state, layers: [...state.layers, layer] })
      return { ...next, selectedLayerId: layer.id, selectedLayerIds: [layer.id], selectedGroupId: null }
    }
    case 'replace-layer':
      return { ...state, layers: state.layers.map((layer) => layer.id === action.id ? action.layer : layer) }
    case 'add-group': {
      const ids = new Set(action.layerIds)
      const selected = state.layers.filter((layer) => ids.has(layer.id))
      const selectedParents = new Set(selected.map((layer) => layer.groupId ?? null))
      const parentId = selected.length && selectedParents.size === 1 ? selected[0].groupId ?? null : action.group.parentId ?? null
      const parentRefs = siblingRefs(state, parentId)
      const selectedRefIds = new Set(selected.flatMap((layer) => (layer.groupId ?? null) === parentId ? [layer.id] : []))
      const topIndex = Math.max(-1, ...parentRefs.map((item, index) => item.type === 'layer' && selectedRefIds.has(item.id) ? index : -1))
      const remainingRefs = parentRefs.filter((item) => item.type !== 'layer' || !selectedRefIds.has(item.id))
      const insertion = topIndex < 0 ? remainingRefs.length : parentRefs.slice(0, topIndex + 1).filter((item) => item.type !== 'layer' || !selectedRefIds.has(item.id)).length
      const group = { ...action.group, parentId, stackOrder: insertion }
      const grouped = selected.map((layer, index) => ({ ...layer, groupId: group.id, stackOrder: index } as EditorLayer))
      const groupedById = new Map(grouped.map((layer) => [layer.id, layer]))
      let next: EditorDocument = {
        ...state,
        groups: [...state.groups, group],
        layers: state.layers.map((layer) => groupedById.get(layer.id) ?? layer),
      }
      next = assignSiblingOrders(next, [...remainingRefs.slice(0, insertion), { type: 'group', id: group.id }, ...remainingRefs.slice(insertion)])
      next = canonicalizeLayers(next)
      return { ...next, selectedGroupId: group.id, selectedLayerId: null, selectedLayerIds: grouped.map((layer) => layer.id) }
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
      const selectedIds = new Set(state.selectedLayerIds)
      const selectedLayerId = layers.findLast((layer) => selectedIds.has(layer.id))?.id ?? null
      return { ...state, layers, selectedLayerId, selectedLayerIds: selectedLayerId ? [selectedLayerId] : [], selectedGroupId: null }
    }
    case 'remove-group': {
      const group = state.groups.find((candidate) => candidate.id === action.id)
      if (!group) return state
      const parentId = group.parentId ?? null
      const parentRefs = siblingRefs(state, parentId)
      const groupIndex = parentRefs.findIndex((item) => item.type === 'group' && item.id === action.id)
      const descendantGroupIds = getDescendantGroupIds(state, action.id)
      descendantGroupIds.add(action.id)
      const removedIds = new Set(state.layers.flatMap((layer) => layer.groupId && descendantGroupIds.has(layer.groupId) ? [layer.id] : []))
      let next: EditorDocument
      if (action.deleteLayers) {
        next = {
          ...state,
          groups: state.groups.filter((candidate) => !descendantGroupIds.has(candidate.id)),
          layers: state.layers.filter((layer) => !removedIds.has(layer.id)),
        }
        next = assignSiblingOrders(next, parentRefs.filter((item) => item.id !== action.id))
      } else {
        const children = siblingRefs(state, action.id)
        next = {
          ...state,
          groups: state.groups.flatMap((candidate) => candidate.id === action.id ? [] : [(candidate.parentId ?? null) === action.id ? { ...candidate, parentId } : candidate]),
          layers: state.layers.map((layer) => (layer.groupId ?? null) === action.id ? { ...layer, groupId: parentId } as EditorLayer : layer),
        }
        const insertion = groupIndex < 0 ? parentRefs.length : groupIndex
        next = assignSiblingOrders(next, [...parentRefs.filter((item) => item.id !== action.id).slice(0, insertion), ...children, ...parentRefs.filter((item) => item.id !== action.id).slice(insertion)])
      }
      next = canonicalizeLayers(next)
      const selectedLayerIds = action.deleteLayers ? state.selectedLayerIds.filter((id) => !removedIds.has(id)) : state.selectedLayerIds
      const selectedLayerId = state.selectedLayerId && selectedLayerIds.includes(state.selectedLayerId) ? state.selectedLayerId : null
      return { ...next, selectedGroupId: null, selectedLayerId, selectedLayerIds }
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
      const descendantIds = getDescendantGroupIds(state, action.id)
      descendantIds.add(action.id)
      const childIds = state.layers.flatMap((layer) => layer.groupId && descendantIds.has(layer.groupId) ? [layer.id] : [])
      return { ...state, selectedGroupId: action.id, selectedLayerId: null, selectedLayerIds: childIds }
    }
    case 'move-layer':
      return moveWithinParent(state, { type: 'layer', id: action.id }, action.direction)
    case 'move-group':
      return moveWithinParent(state, { type: 'group', id: action.id }, action.direction)
    case 'move-stack-item':
      return moveStackItem(state, { type: action.itemType, id: action.id }, action.parentId, action.beforeId)
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

const documentFields = [
  'schemaVersion',
  'bitDepth',
  'canvasPreset',
  'canvasSize',
  'background',
  'pattern',
  'groups',
  'layers',
  'selectedLayerId',
  'selectedLayerIds',
  'selectedGroupId',
  'channels',
  'paths',
  'selectedPathId',
  'guides',
  'grid',
  'artboards',
  'colorMode',
  'indexedColors',
  'colorSettings',
  'psdMetadata',
] as const satisfies readonly (keyof EditorDocument)[]

function documentPatch(from: EditorDocument, to: EditorDocument): DocumentStatePatch {
  return Object.fromEntries(documentFields.flatMap((field) => from[field] !== to[field] ? [[field, to[field]]] : [])) as DocumentStatePatch
}

function applyDocumentPatch(document: EditorDocument, patch: DocumentStatePatch): EditorDocument {
  return { ...document, ...patch }
}

function historyCommand(before: EditorDocument, after: EditorDocument, actionType: DocumentAction['type']): DocumentHistoryCommand {
  return {
    type: 'document-change',
    actionType,
    undo: documentPatch(after, before),
    redo: documentPatch(before, after),
  }
}

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'apply': {
      const present = documentReducer(state.present, action.action)
      if (present === state.present) return state
      if (action.record === false) return { ...state, present }

      if (action.groupKey && action.groupKey === state.groupKey) {
        const previousCommand = state.past.at(-1)
        if (!previousCommand) return { ...state, present, future: [] }
        const beforeGroup = applyDocumentPatch(state.present, previousCommand.undo)
        const command = historyCommand(beforeGroup, present, previousCommand.actionType)
        return { ...state, past: [...state.past.slice(0, -1), command], present, future: [] }
      }

      return {
        past: [...state.past, historyCommand(state.present, present, action.action.type)].slice(-60),
        present,
        future: [],
        groupKey: action.groupKey ?? null,
      }
    }
    case 'end-group':
      return state.groupKey ? { ...state, groupKey: null } : state
    case 'undo': {
      const command = state.past.at(-1)
      if (!command) return state
      return {
        past: state.past.slice(0, -1),
        present: applyDocumentPatch(state.present, command.undo),
        future: [command, ...state.future].slice(0, 60),
        groupKey: null,
      }
    }
    case 'redo': {
      const command = state.future[0]
      if (!command) return state
      return {
        past: [...state.past, command].slice(-60),
        present: applyDocumentPatch(state.present, command.redo),
        future: state.future.slice(1),
        groupKey: null,
      }
    }
    case 'replace':
      return { past: [], present: action.document, future: [], groupKey: null }
    case 'restore':
      return action.state
    case 'discard-future':
      return state.future.length ? { ...state, future: [] } : state
  }
}
