export const defaultSwatches = [
  '#000000', '#27272a', '#52525b', '#a1a1aa', '#ffffff',
  '#7f1d1d', '#dc2626', '#fb7185', '#f97316', '#facc15',
  '#14532d', '#16a34a', '#4ade80', '#0f766e', '#22d3ee',
  '#1e3a8a', '#2563eb', '#60a5fa', '#4c1d95', '#7c3aed',
  '#c084fc', '#831843', '#db2777', '#f472b6', '#a16207',
] as const

const defaultSwatchSet = new Set<string>(defaultSwatches)

export function normalizeHexColor(value: unknown, fallback = '#000000') {
  if (typeof value !== 'string') return fallback
  const color = value.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(color) ? color : fallback
}

export function normalizeCustomSwatches(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.flatMap((color) => {
    const normalized = normalizeHexColor(color, '')
    return normalized && !defaultSwatchSet.has(normalized) ? [normalized] : []
  }))].slice(0, 64)
}
