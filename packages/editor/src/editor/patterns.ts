import { normalizeHexColor } from './swatches'
import type { PatternKind, PatternSettings } from './types'

export type PatternPreset = PatternSettings & {
  id: string
  name: string
  kind: Exclude<PatternKind, 'none'>
}

export const defaultPatterns: readonly PatternPreset[] = [
  { id: 'graphite-grid', name: 'Graphite grid', kind: 'grid', color: '#71717a', opacity: 18, size: 32 },
  { id: 'blueprint', name: 'Blueprint', kind: 'grid', color: '#38bdf8', opacity: 28, size: 48 },
  { id: 'fine-grid', name: 'Fine grid', kind: 'grid', color: '#ffffff', opacity: 12, size: 18 },
  { id: 'soft-dots', name: 'Soft dots', kind: 'dots', color: '#ffffff', opacity: 20, size: 32 },
  { id: 'violet-dots', name: 'Violet dots', kind: 'dots', color: '#c4b5fd', opacity: 32, size: 22 },
  { id: 'gentle-waves', name: 'Gentle waves', kind: 'waves', color: '#67e8f9', opacity: 24, size: 42 },
]

const patternKinds: PatternPreset['kind'][] = ['grid', 'dots', 'waves']

function clampNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.max(minimum, Math.min(maximum, value)))
    : fallback
}

export function normalizeCustomPatterns(value: unknown) {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((entry, index): PatternPreset[] => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Partial<PatternPreset>
    const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 48) : ''
    const kind = patternKinds.includes(candidate.kind as PatternPreset['kind']) ? candidate.kind as PatternPreset['kind'] : null
    const color = normalizeHexColor(candidate.color, '')
    const opacity = clampNumber(candidate.opacity, 20, 1, 100)
    const size = clampNumber(candidate.size, 40, 12, 160)
    const signature = `${kind}:${color}:${opacity}:${size}:${name.toLocaleLowerCase()}`
    if (!name || !kind || !color || seen.has(signature)) return []
    seen.add(signature)
    const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim().slice(0, 80) : `pattern-${index}`
    return [{ id, name, kind, color, opacity, size }]
  }).slice(0, 48)
}
