import { describe, expect, it } from 'vitest'
import { normalizeCustomShapes, parseCustomShapeFile, serializeCustomShape } from './shape-library'

const shape = { id: 'heart', name: 'Heart', paths: [{ closed: true, operation: 'combine' as const, fillRule: 'non-zero' as const, knots: [{ linked: true, in: { x: 0, y: 0 }, anchor: { x: 0.5, y: 0 }, out: { x: 1, y: 0 } }] }] }

describe('custom shape library', () => {
  it('normalizes and round-trips portable local shape presets', async () => {
    expect(normalizeCustomShapes([shape, shape])).toEqual([shape])
    const file = new File([serializeCustomShape(shape)], 'heart.studio-shape', { type: 'application/x-studio-shape+json' })
    await expect(parseCustomShapeFile(file)).resolves.toEqual(shape)
  })
})
