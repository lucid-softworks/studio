import type { EditorLayer, LayerPatch, Position } from './types'
import type { LayerBounds, ResizeHandle } from './renderer'

export type TransformResizeSnapshot = {
  layer: EditorLayer
  bounds: LayerBounds
  handle: ResizeHandle
  canvasWidth: number
  canvasHeight: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const hasX = (handle: ResizeHandle) => handle.includes('e') || handle.includes('w')
const hasY = (handle: ResizeHandle) => handle.includes('n') || handle.includes('s')

function rotate(position: Position, degrees: number): Position {
  const angle = degrees * Math.PI / 180
  return {
    x: position.x * Math.cos(angle) - position.y * Math.sin(angle),
    y: position.x * Math.sin(angle) + position.y * Math.cos(angle),
  }
}

function localPoint(point: Position, bounds: LayerBounds) {
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  return rotate({ x: point.x - center.x, y: point.y - center.y }, -bounds.rotation)
}

function positionWithShift(layer: EditorLayer, shift: Position, snapshot: TransformResizeSnapshot) {
  const worldShift = rotate(shift, snapshot.bounds.rotation)
  return {
    x: layer.position.x + worldShift.x / snapshot.canvasWidth,
    y: layer.position.y + worldShift.y / snapshot.canvasHeight,
  }
}

function uniformRatio(snapshot: TransformResizeSnapshot, point: Position, fromCenter: boolean) {
  const { bounds, handle } = snapshot
  const local = localPoint(point, bounds)
  const initial = {
    x: handle.includes('e') ? bounds.width / 2 : handle.includes('w') ? -bounds.width / 2 : 0,
    y: handle.includes('s') ? bounds.height / 2 : handle.includes('n') ? -bounds.height / 2 : 0,
  }
  const anchor = fromCenter ? { x: 0, y: 0 } : { x: -initial.x, y: -initial.y }
  const initialVector = { x: initial.x - anchor.x, y: initial.y - anchor.y }
  const currentVector = { x: local.x - anchor.x, y: local.y - anchor.y }
  const denominator = initialVector.x ** 2 + initialVector.y ** 2
  const ratio = denominator ? (currentVector.x * initialVector.x + currentVector.y * initialVector.y) / denominator : 1
  const safeRatio = clamp(ratio, 0.05, 20)
  const shift = fromCenter ? { x: 0, y: 0 } : {
    x: anchor.x + initialVector.x * safeRatio / 2,
    y: anchor.y + initialVector.y * safeRatio / 2,
  }
  return { ratio: safeRatio, shift }
}

export function calculateLayerResize(
  snapshot: TransformResizeSnapshot,
  point: Position,
  options: { fromCenter: boolean; preserveAspect: boolean },
): LayerPatch {
  const { layer, bounds, handle, canvasWidth, canvasHeight } = snapshot

  if (layer.type !== 'shape' || options.preserveAspect) {
    const { ratio, shift } = uniformRatio(snapshot, point, options.fromCenter)
    const position = positionWithShift(layer, shift, snapshot)
    if (layer.type === 'image' || layer.type === 'raster') return { scale: Math.round(clamp(layer.scale * ratio, 10, 300)), position }
    if (layer.type === 'text') return { fontSize: Math.round(clamp(layer.fontSize * ratio, 8, 300)), position }
    return {
      width: Math.round(clamp(layer.width * ratio, 2, 150) * 10) / 10,
      height: Math.round(clamp(layer.height * ratio, 2, 150) * 10) / 10,
      position,
    }
  }

  const local = localPoint(point, bounds)
  const minimum = 12
  let width = bounds.width
  let height = bounds.height
  let shiftX = 0
  let shiftY = 0

  if (hasX(handle)) {
    if (options.fromCenter) width = Math.max(minimum, Math.abs(local.x) * 2)
    else {
      const anchor = handle.includes('e') ? -bounds.width / 2 : bounds.width / 2
      const edge = handle.includes('e') ? Math.max(anchor + minimum, local.x) : Math.min(anchor - minimum, local.x)
      width = Math.abs(edge - anchor)
      shiftX = (edge + anchor) / 2
    }
  }
  if (hasY(handle)) {
    if (options.fromCenter) height = Math.max(minimum, Math.abs(local.y) * 2)
    else {
      const anchor = handle.includes('s') ? -bounds.height / 2 : bounds.height / 2
      const edge = handle.includes('s') ? Math.max(anchor + minimum, local.y) : Math.min(anchor - minimum, local.y)
      height = Math.abs(edge - anchor)
      shiftY = (edge + anchor) / 2
    }
  }

  return {
    width: Math.round(clamp(width / canvasWidth * 100, 2, 150) * 10) / 10,
    height: Math.round(clamp(height / canvasHeight * 100, 2, 150) * 10) / 10,
    position: positionWithShift(layer, { x: shiftX, y: shiftY }, snapshot),
  }
}

export function calculateRotation(bounds: LayerBounds, point: Position, pointerOffset: number) {
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  return Math.round((Math.atan2(point.y - centerY, point.x - centerX) * 180 / Math.PI - pointerOffset + 540) % 360 - 180)
}
