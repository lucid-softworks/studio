import type { EditorLayer, LayerGeometryTransform, LayerPatch, Position } from './types'
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

export const defaultGeometryTransform: LayerGeometryTransform = {
  skewX: 0,
  skewY: 0,
  perspectiveX: 0,
  perspectiveY: 0,
  corners: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
  interpolation: 'bicubic',
  referencePoint: { x: 0.5, y: 0.5 },
}

export function normalizeGeometryTransform(value?: LayerGeometryTransform | null): LayerGeometryTransform {
  return value ? { ...defaultGeometryTransform, ...value, corners: value.corners?.length === 4 ? value.corners : defaultGeometryTransform.corners } : structuredClone(defaultGeometryTransform)
}

export function geometryTransformIsIdentity(value?: LayerGeometryTransform | null) {
  if (!value) return true
  const geometry = normalizeGeometryTransform(value)
  return geometry.skewX === 0 && geometry.skewY === 0 && geometry.perspectiveX === 0 && geometry.perspectiveY === 0
    && geometry.corners.every((corner) => corner.x === 0 && corner.y === 0)
    && !geometry.warp && !(geometry.puppetPins?.length)
}

function bilinear(corners: LayerGeometryTransform['corners'], u: number, v: number) {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners
  return {
    x: topLeft.x * (1 - u) * (1 - v) + topRight.x * u * (1 - v) + bottomRight.x * u * v + bottomLeft.x * (1 - u) * v,
    y: topLeft.y * (1 - u) * (1 - v) + topRight.y * u * (1 - v) + bottomRight.y * u * v + bottomLeft.y * (1 - u) * v,
  }
}

export function geometryMesh(value?: LayerGeometryTransform | null) {
  const geometry = normalizeGeometryTransform(value)
  const columns = geometry.warp?.columns ?? (geometry.puppetPins?.length ? 9 : 2)
  const rows = geometry.warp?.rows ?? (geometry.puppetPins?.length ? 9 : 2)
  const source: Position[] = []
  const destination: Position[] = []
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const u = columns === 1 ? 0.5 : column / (columns - 1)
    const v = rows === 1 ? 0.5 : row / (rows - 1)
    source.push({ x: u, y: v })
    const stored = geometry.warp?.points[row * columns + column]
    let x = stored?.x ?? u
    let y = stored?.y ?? v
    if (!stored) {
      x = 0.5 + (u - 0.5) * (1 + geometry.perspectiveX / 100 * (v - 0.5) * 1.5) + Math.tan(geometry.skewX * Math.PI / 180) * (v - 0.5)
      y = 0.5 + (v - 0.5) * (1 + geometry.perspectiveY / 100 * (u - 0.5) * 1.5) + Math.tan(geometry.skewY * Math.PI / 180) * (u - 0.5)
      const corner = bilinear(geometry.corners, u, v)
      x += corner.x
      y += corner.y
    }
    if (geometry.puppetPins?.length) {
      let total = 0
      let dx = 0
      let dy = 0
      for (const pin of geometry.puppetPins) {
        const distanceSquared = (u - pin.source.x) ** 2 + (v - pin.source.y) ** 2
        const weight = 1 / Math.max(0.0001, distanceSquared)
        total += weight
        dx += (pin.position.x - pin.source.x) * weight
        dy += (pin.position.y - pin.source.y) * weight
      }
      x += dx / total
      y += dy / total
    }
    destination.push({ x, y })
  }
  return { columns, rows, source, destination }
}

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
  if (layer.type === 'adjustment') return {}

  if (layer.type !== 'shape' || options.preserveAspect) {
    const { ratio, shift } = uniformRatio(snapshot, point, options.fromCenter)
    const position = positionWithShift(layer, shift, snapshot)
    if (layer.type === 'image' || layer.type === 'raster' || layer.type === 'smart-object') return { scale: Math.round(clamp(layer.scale * ratio, 10, 300)), position }
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
