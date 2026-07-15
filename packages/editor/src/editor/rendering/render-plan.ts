import { hasEnabledLayerEffects, normalizeLayerEffects } from '../effects'
import { normalizeLayerFilters } from '../filters'
import { getStackChildren, type StackItem } from '../stack'
import type { BlendMode, EditorDocument, LayerEffects, LayerFilters } from '../types'
import { isTypeGpuBlendMode } from './typegpu-blend-modes'

export type LayerRenderNode = {
  kind: 'layer'
  layerId: string
  layerType: 'image' | 'raster' | 'text' | 'shape'
  opacity: number
  blendMode: BlendMode
  maskAssetId: string | null
  clipBaseLayerId: string | null
  filters: LayerFilters | null
  effects: LayerEffects | null
}

export type AdjustmentRenderNode = {
  kind: 'adjustment'
  layerId: string
  opacity: number
  blendMode: BlendMode
  brightness: number
  contrast: number
  saturation: number
  hue: number
  blur: number
}

export type GroupRenderNode = {
  kind: 'group'
  groupId: string
  isolated: boolean
  opacity: number
  blendMode: BlendMode
  children: RenderPlanNode[]
}

export type RenderPlanNode = LayerRenderNode | AdjustmentRenderNode | GroupRenderNode

export type CompositionRenderPlan = {
  documentSchemaVersion: number
  nodes: RenderPlanNode[]
}

export type NativeLayerCompositionPlan = {
  documentSchemaVersion: number
  layers: Array<LayerRenderNode | AdjustmentRenderNode | GroupRenderNode>
}

function clippingBaseFor(items: StackItem[], index: number) {
  for (let candidateIndex = index - 1; candidateIndex >= 0; candidateIndex -= 1) {
    const item = items[candidateIndex]
    if (item.type === 'group') return null
    if (item.layer.type === 'adjustment' || item.layer.clipToBelow) continue
    return item.layer
  }
  return null
}

function planNodes(
  document: EditorDocument,
  parentId: string | null,
  seen: ReadonlySet<string>,
): RenderPlanNode[] {
  const items = getStackChildren(document, parentId)
  return items.flatMap((item, index): RenderPlanNode[] => {
    if (item.type === 'group') {
      const group = item.group
      if (!group.visible || seen.has(group.id)) return []
      const nextSeen = new Set(seen)
      nextSeen.add(group.id)
      return [{
        kind: 'group',
        groupId: group.id,
        isolated: !(group.passThrough && group.opacity === 100),
        opacity: group.opacity,
        blendMode: group.blendMode,
        children: planNodes(document, group.id, nextSeen),
      }]
    }

    const layer = item.layer
    if (!layer.visible) return []
    if (layer.type === 'adjustment') {
      return [{
        kind: 'adjustment',
        layerId: layer.id,
        opacity: layer.opacity,
        blendMode: layer.blendMode ?? 'normal',
        brightness: layer.brightness,
        contrast: layer.contrast,
        saturation: layer.saturation,
        hue: layer.hue,
        blur: layer.blur,
      }]
    }

    const clippingBase = layer.clipToBelow ? clippingBaseFor(items, index) : null
    if (clippingBase && !clippingBase.visible) return []
    return [{
      kind: 'layer',
      layerId: layer.id,
      layerType: layer.type,
      opacity: layer.opacity,
      blendMode: layer.blendMode ?? 'normal',
      maskAssetId: layer.maskAssetId ?? null,
      clipBaseLayerId: clippingBase?.id ?? null,
      filters: layer.filters ? normalizeLayerFilters(layer.filters) : null,
      effects: hasEnabledLayerEffects(layer.effects) ? normalizeLayerEffects(layer.effects) : null,
    }]
  })
}

export function buildCompositionRenderPlan(document: EditorDocument): CompositionRenderPlan {
  return {
    documentSchemaVersion: document.schemaVersion,
    nodes: planNodes(document, null, new Set()),
  }
}

function collectNativeLayers(nodes: RenderPlanNode[], layers: Array<LayerRenderNode | AdjustmentRenderNode | GroupRenderNode>): boolean {
  for (const node of nodes) {
    if (node.kind === 'group') {
      if (!isTypeGpuBlendMode(node.blendMode)) return false
      if (node.isolated) {
        const children: Array<LayerRenderNode | AdjustmentRenderNode | GroupRenderNode> = []
        if (!collectNativeLayers(node.children, children)) return false
        layers.push({ ...node, children })
      } else if (!collectNativeLayers(node.children, layers)) return false
      continue
    }
    if (node.kind === 'adjustment') {
      if (!isTypeGpuBlendMode(node.blendMode)) return false
      layers.push(node)
      continue
    }
    if (!isTypeGpuBlendMode(node.blendMode)) return false
    layers.push(node)
  }
  return true
}

export function buildNativeLayerCompositionPlan(document: EditorDocument): NativeLayerCompositionPlan | null {
  if (document.layers.some((layer) => (
    layer.vectorMask
    || layer.blendIf
    || (layer.maskSettings && (layer.maskSettings.density !== 100 || layer.maskSettings.feather > 0))
  ))) return null
  if (document.layers.some((layer) => {
    const effects = normalizeLayerEffects(layer.effects)
    return effects.innerShadow.enabled || effects.innerGlow.enabled || effects.bevel.enabled || effects.satin.enabled
      || effects.gradientOverlay.enabled || effects.patternOverlay.enabled || effects.stroke.enabled
  })) return null
  const plan = buildCompositionRenderPlan(document)
  const layers: Array<LayerRenderNode | AdjustmentRenderNode | GroupRenderNode> = []
  if (!collectNativeLayers(plan.nodes, layers)) return null
  return { documentSchemaVersion: plan.documentSchemaVersion, layers }
}
