import { describe, expect, it } from 'vitest'
import { calculateLayerResize, calculateRotation } from './transform'
import type { ShapeLayer } from './types'

const shape: ShapeLayer = {
  id: 'shape', type: 'shape', shape: 'rectangle', name: 'Shape', visible: true, locked: false,
  opacity: 100, position: { x: 0, y: 0 }, rotation: 0, width: 20, height: 20,
  fill: '#fff', stroke: '#000', strokeWidth: 0, cornerRadius: 0,
}

const snapshot = {
  layer: shape,
  bounds: { x: 400, y: 400, width: 200, height: 200, rotation: 0 },
  handle: 'e' as const,
  canvasWidth: 1000,
  canvasHeight: 1000,
}

describe('transform calculations', () => {
  it('resizes one edge while keeping its opposite edge anchored', () => {
    const patch = calculateLayerResize(snapshot, { x: 700, y: 500 }, { fromCenter: false, preserveAspect: false })
    expect(patch.width).toBe(30)
    expect(patch.height).toBe(20)
    expect(patch.position).toEqual({ x: 0.05, y: 0 })
  })

  it('resizes from the centre while Alt is held', () => {
    const patch = calculateLayerResize(snapshot, { x: 700, y: 500 }, { fromCenter: true, preserveAspect: false })
    expect(patch.width).toBe(40)
    expect(patch.position).toEqual({ x: 0, y: 0 })
  })

  it('calculates rotation around the selection centre', () => {
    expect(calculateRotation(snapshot.bounds, { x: 500, y: 300 }, -90)).toBe(0)
    expect(calculateRotation(snapshot.bounds, { x: 700, y: 500 }, -90)).toBe(90)
  })
})
