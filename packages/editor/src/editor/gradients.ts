import { normalizeHexColor } from './swatches'

export type GradientPreset = {
  id: string
  name: string
  start: string
  end: string
}

export const defaultGradients: readonly GradientPreset[] = [
  { id: 'black-white', name: 'Black to white', start: '#000000', end: '#ffffff' },
  { id: 'sunset', name: 'Sunset', start: '#fb7185', end: '#f97316' },
  { id: 'violet-sky', name: 'Violet sky', start: '#7c3aed', end: '#38bdf8' },
  { id: 'ocean', name: 'Ocean', start: '#0f766e', end: '#22d3ee' },
  { id: 'forest', name: 'Forest', start: '#14532d', end: '#4ade80' },
  { id: 'berry', name: 'Berry', start: '#831843', end: '#c084fc' },
  { id: 'ember', name: 'Ember', start: '#7f1d1d', end: '#facc15' },
  { id: 'midnight', name: 'Midnight', start: '#18181b', end: '#312e81' },
]

export function normalizeCustomGradients(value: unknown) {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((entry, index): GradientPreset[] => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Partial<GradientPreset>
    const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 48) : ''
    const start = normalizeHexColor(candidate.start, '')
    const end = normalizeHexColor(candidate.end, '')
    const signature = `${start}:${end}:${name.toLocaleLowerCase()}`
    if (!name || !start || !end || seen.has(signature)) return []
    seen.add(signature)
    const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim().slice(0, 80) : `gradient-${index}`
    return [{ id, name, start, end }]
  }).slice(0, 48)
}
