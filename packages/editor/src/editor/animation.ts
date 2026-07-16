import type { AnimationFrame, AnimationKeyframe, DocumentAnimation, EditorDocument, EditorLayer } from './types'

export const defaultAnimation: DocumentAnimation = { mode: 'frame', fps: 12, duration: 2, loop: true, onionSkin: false, frames: [], keyframes: [] }

export function normalizeAnimation(value: DocumentAnimation | undefined): DocumentAnimation {
  if (!value) return structuredClone(defaultAnimation)
  return {
    mode: value.mode === 'timeline' ? 'timeline' : 'frame',
    fps: Math.max(1, Math.min(60, Math.round(value.fps || 12))),
    duration: Math.max(0.1, Math.min(3600, Number(value.duration) || 2)),
    loop: value.loop !== false,
    onionSkin: Boolean(value.onionSkin),
    frames: Array.isArray(value.frames) ? value.frames.slice(0, 10_000).map((frame, index) => ({ id: String(frame.id || crypto.randomUUID()), name: String(frame.name || `Frame ${index + 1}`).slice(0, 64), delayMs: Math.max(10, Math.min(60_000, Math.round(frame.delayMs || 100))), visibleLayerIds: Array.isArray(frame.visibleLayerIds) ? frame.visibleLayerIds.map(String) : [] })) : [],
    keyframes: Array.isArray(value.keyframes) ? value.keyframes.slice(0, 100_000).map((keyframe) => ({ ...keyframe, id: String(keyframe.id || crypto.randomUUID()), layerId: String(keyframe.layerId), time: Math.max(0, Number(keyframe.time) || 0), position: { x: Number(keyframe.position?.x) || 0, y: Number(keyframe.position?.y) || 0 }, rotation: Number(keyframe.rotation) || 0, opacity: Math.max(0, Math.min(100, Number(keyframe.opacity) || 0)) })) : [],
  }
}

export function captureAnimationFrame(document: EditorDocument, index: number): AnimationFrame {
  return { id: crypto.randomUUID(), name: `Frame ${index + 1}`, delayMs: Math.round(1000 / normalizeAnimation(document.animation).fps), visibleLayerIds: document.layers.filter((layer) => layer.visible).map((layer) => layer.id) }
}

export function captureLayerKeyframe(layer: EditorLayer, time: number): AnimationKeyframe {
  return { id: crypto.randomUUID(), layerId: layer.id, time: Math.max(0, time), position: { ...layer.position }, rotation: layer.rotation, opacity: layer.opacity }
}

function interpolatedLayer(layer: EditorLayer, keyframes: AnimationKeyframe[], time: number): EditorLayer {
  const keys = keyframes.filter((keyframe) => keyframe.layerId === layer.id).sort((left, right) => left.time - right.time)
  if (!keys.length) return layer
  const before = keys.findLast((keyframe) => keyframe.time <= time) ?? keys[0]
  const after = keys.find((keyframe) => keyframe.time >= time) ?? keys.at(-1)!
  const span = after.time - before.time
  const amount = span > 0 ? Math.max(0, Math.min(1, (time - before.time) / span)) : 0
  const mix = (left: number, right: number) => left + (right - left) * amount
  return { ...layer, position: { x: mix(before.position.x, after.position.x), y: mix(before.position.y, after.position.y) }, rotation: mix(before.rotation, after.rotation), opacity: mix(before.opacity, after.opacity) }
}

export function animationDocumentAt(document: EditorDocument, preview: { frameIndex: number; time: number }): EditorDocument {
  const animation = document.animation
  if (!animation) return document
  if (animation.mode === 'timeline') return { ...document, layers: document.layers.map((layer) => interpolatedLayer(layer, animation.keyframes, preview.time)) }
  const frame = animation.frames[preview.frameIndex]
  if (!frame) return document
  const visible = new Set(frame.visibleLayerIds)
  const current = document.layers.map((layer) => ({ ...layer, visible: visible.has(layer.id) } as EditorLayer))
  if (!animation.onionSkin || animation.frames.length < 2) return { ...document, layers: current }
  const adjacent = [animation.frames[preview.frameIndex - 1], animation.frames[preview.frameIndex + 1]].filter((candidate): candidate is AnimationFrame => Boolean(candidate))
  const onions = adjacent.flatMap((candidate, adjacentIndex) => {
    const ids = new Set(candidate.visibleLayerIds)
    return document.layers.filter((layer) => ids.has(layer.id) && !visible.has(layer.id)).map((layer) => ({ ...layer, id: `onion-${adjacentIndex}-${layer.id}`, name: `Onion · ${layer.name}`, opacity: Math.min(22, layer.opacity * 0.22), locked: true } as EditorLayer))
  })
  return { ...document, layers: [...onions, ...current], selectedLayerId: null, selectedLayerIds: [] }
}
