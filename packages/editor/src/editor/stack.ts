import type { EditorDocument, EditorLayer, LayerGroup } from './types'

export type StackItem =
  | { type: 'layer'; id: string; order: number; layer: EditorLayer }
  | { type: 'group'; id: string; order: number; group: LayerGroup }

const finiteOrder = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value as number : fallback

export function getStackChildren(document: EditorDocument, parentId: string | null): StackItem[] {
  const layerItems = document.layers.flatMap((layer, index): StackItem[] => (layer.groupId ?? null) === parentId
    ? [{ type: 'layer', id: layer.id, order: finiteOrder(layer.stackOrder, index * 2), layer }]
    : [])
  const groupItems = document.groups.flatMap((group, index): StackItem[] => (group.parentId ?? null) === parentId
    ? [{
        type: 'group',
        id: group.id,
        order: finiteOrder(group.stackOrder, (() => {
          const childIndex = document.layers.findIndex((layer) => layer.groupId === group.id)
          return childIndex < 0 ? document.layers.length * 2 + index : childIndex * 2
        })()),
        group,
      }]
    : [])
  return [...layerItems, ...groupItems].sort((a, b) => a.order - b.order)
}

export function getGroupAncestors(document: EditorDocument, groupId: string | null) {
  const groups = new Map(document.groups.map((group) => [group.id, group]))
  const ancestors: LayerGroup[] = []
  const seen = new Set<string>()
  let currentId = groupId
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId)
    const group = groups.get(currentId)
    if (!group) break
    ancestors.push(group)
    currentId = group.parentId ?? null
  }
  return ancestors
}

export function getDescendantGroupIds(document: EditorDocument, groupId: string) {
  const ids = new Set<string>()
  const visit = (parentId: string) => {
    for (const group of document.groups) {
      if ((group.parentId ?? null) !== parentId || ids.has(group.id)) continue
      ids.add(group.id)
      visit(group.id)
    }
  }
  visit(groupId)
  return ids
}

export function getDescendantLayers(document: EditorDocument, groupId: string) {
  return flattenStackLayers(document, groupId, new Set())
}

export function flattenStackLayers(document: EditorDocument, parentId: string | null = null, seen = new Set<string>()): EditorLayer[] {
  const layers: EditorLayer[] = []
  for (const item of getStackChildren(document, parentId)) {
    if (item.type === 'layer') layers.push(item.layer)
    else if (!seen.has(item.id)) {
      const nextSeen = new Set(seen)
      nextSeen.add(item.id)
      layers.push(...flattenStackLayers(document, item.id, nextSeen))
    }
  }
  return layers
}

export function layerIsVisible(document: EditorDocument, layer: EditorLayer) {
  return layer.visible && getGroupAncestors(document, layer.groupId ?? null).every((group) => group.visible)
}

export function layerIsLocked(document: EditorDocument, layer: EditorLayer) {
  return layer.locked || getGroupAncestors(document, layer.groupId ?? null).some((group) => group.locked)
}

export function groupIsVisible(document: EditorDocument, group: LayerGroup) {
  return group.visible && getGroupAncestors(document, group.parentId ?? null).every((ancestor) => ancestor.visible)
}

export function groupIsLocked(document: EditorDocument, group: LayerGroup) {
  return group.locked || getGroupAncestors(document, group.parentId ?? null).some((ancestor) => ancestor.locked)
}
