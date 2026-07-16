import { normalizeHexColor } from './swatches'

export type GradientStop = { color: string; position: number }
export type GradientPreset = { id: string; name: string; start: string; end: string; stops: GradientStop[] }

export function gradientStops(colors: string[]): GradientStop[] {
  return colors.map((color, index) => ({ color, position: colors.length === 1 ? 0 : Math.round(index / (colors.length - 1) * 100) }))
}

function preset(id: string, name: string, colors: string[]): GradientPreset {
  const stops = gradientStops(colors)
  return { id, name, stops, start: stops[0].color, end: stops.at(-1)!.color }
}

export const defaultGradients: readonly GradientPreset[] = [
  preset('black-white', 'Black to white', ['#000000', '#ffffff']),
  preset('sunset', 'Sunset', ['#fb7185', '#f97316', '#facc15']),
  preset('violet-sky', 'Violet sky', ['#7c3aed', '#6366f1', '#38bdf8']),
  preset('ocean', 'Ocean', ['#0f766e', '#0891b2', '#22d3ee']),
  preset('forest', 'Forest', ['#14532d', '#16a34a', '#4ade80']),
  preset('berry', 'Berry', ['#831843', '#be185d', '#c084fc']),
  preset('ember', 'Ember', ['#7f1d1d', '#f97316', '#facc15']),
  preset('midnight', 'Midnight', ['#18181b', '#1e1b4b', '#312e81']),
]

export function normalizeGradientStops(value: unknown, fallbackStart = '#000000', fallbackEnd = '#ffffff') {
  const source = Array.isArray(value) ? value : []
  const stops = source.flatMap((entry): GradientStop[] => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Partial<GradientStop>
    const color = normalizeHexColor(candidate.color, '')
    if (!color || typeof candidate.position !== 'number' || !Number.isFinite(candidate.position)) return []
    return [{ color, position: Math.max(0, Math.min(100, Math.round(candidate.position))) }]
  }).sort((left, right) => left.position - right.position).slice(0, 16)
  if (stops.length >= 2) return stops
  return gradientStops([normalizeHexColor(fallbackStart, '#000000'), normalizeHexColor(fallbackEnd, '#ffffff')])
}

export function normalizeCustomGradients(value: unknown) {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((entry, index): GradientPreset[] => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Partial<GradientPreset>
    const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 48) : ''
    const stops = normalizeGradientStops(candidate.stops, candidate.start, candidate.end)
    const signature = `${stops.map((stop) => `${stop.color}@${stop.position}`).join(':')}:${name.toLocaleLowerCase()}`
    if (!name || seen.has(signature)) return []
    seen.add(signature)
    const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim().slice(0, 80) : `gradient-${index}`
    return [{ id, name, stops, start: stops[0].color, end: stops.at(-1)!.color }]
  }).slice(0, 48)
}
