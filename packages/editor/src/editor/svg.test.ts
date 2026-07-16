import { describe, expect, it } from 'vitest'
import { createShapeLayer, initialDocument } from './presets'
import { exportSvgDocument, vectorPathData } from './svg'

const path = { closed: true, operation: 'combine' as const, fillRule: 'non-zero' as const, knots: [{ linked: true, in: { x: 0, y: 0 }, anchor: { x: 0, y: 0 }, out: { x: 0.25, y: 0 } }, { linked: true, in: { x: 0.75, y: 1 }, anchor: { x: 1, y: 1 }, out: { x: 1, y: 1 } }] }

describe('editable SVG vectors', () => {
  it('writes cubic path data and exact Studio vector metadata', async () => {
    expect(vectorPathData([path], 100, 50)).toBe('M 0 0 C 25 0 75 50 100 50 C 100 50 0 0 0 0 Z')
    const layer = { ...createShapeLayer('path', 1), vectorPaths: [path], width: 100, height: 100 }
    const svg = await exportSvgDocument({ ...initialDocument, layers: [layer] }).text()
    expect(svg).toContain('data-studio-vector=')
    expect(svg).toContain('<path')
  })
})
