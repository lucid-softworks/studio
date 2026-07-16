import type { VectorPath } from './types'

export type CustomShapePreset = { id: string; name: string; paths: VectorPath[] }

function isPosition(value: unknown): value is { x: number; y: number } {
  return Boolean(value && typeof value === 'object' && Number.isFinite((value as { x?: unknown }).x) && Number.isFinite((value as { y?: unknown }).y))
}

function isVectorPath(value: unknown): value is VectorPath {
  if (!value || typeof value !== 'object') return false
  const path = value as Partial<VectorPath>
  return typeof path.closed === 'boolean'
    && ['exclude', 'combine', 'subtract', 'intersect'].includes(path.operation ?? '')
    && ['even-odd', 'non-zero'].includes(path.fillRule ?? '')
    && Array.isArray(path.knots)
    && path.knots.every((knot) => Boolean(knot && typeof knot.linked === 'boolean' && isPosition(knot.in) && isPosition(knot.anchor) && isPosition(knot.out)))
}

export function normalizeCustomShapes(value: unknown): CustomShapePreset[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return []
    const shape = candidate as Partial<CustomShapePreset>
    if (typeof shape.id !== 'string' || !shape.id || seen.has(shape.id) || typeof shape.name !== 'string' || !shape.name.trim() || !Array.isArray(shape.paths) || !shape.paths.length || !shape.paths.every(isVectorPath)) return []
    seen.add(shape.id)
    return [{ id: shape.id, name: shape.name.slice(0, 64), paths: structuredClone(shape.paths) }]
  })
}

export function serializeCustomShape(shape: CustomShapePreset) {
  return new Blob([JSON.stringify({ app: 'studio-shape', version: 1, shape }, null, 2)], { type: 'application/x-studio-shape+json' })
}

export async function parseCustomShapeFile(file: File): Promise<CustomShapePreset> {
  const value = JSON.parse(await file.text()) as { app?: unknown; version?: unknown; shape?: unknown }
  if (value.app !== 'studio-shape' || value.version !== 1) throw new Error('That is not a supported Studio custom-shape file.')
  const [shape] = normalizeCustomShapes([value.shape])
  if (!shape) throw new Error('The custom shape is incomplete or damaged.')
  return shape
}
