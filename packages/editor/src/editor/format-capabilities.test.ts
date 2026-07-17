import { describe, expect, it } from 'vitest'
import { formatCapabilities, formatCapabilityStatuses } from './format-capabilities'

describe('format capability registry', () => {
  it('uses stable IDs and documented retention states', () => {
    expect(formatCapabilities.length).toBeGreaterThanOrEqual(14)
    expect(new Set(formatCapabilities.map((entry) => entry.id)).size).toBe(formatCapabilities.length)
    expect(formatCapabilities.every((entry) => formatCapabilityStatuses.includes(entry.import))).toBe(true)
    expect(formatCapabilities.every((entry) => formatCapabilityStatuses.includes(entry.export))).toBe(true)
    expect(formatCapabilities.every((entry) => entry.detail.length > 40)).toBe(true)
  })

  it('covers every built-in export format', () => {
    const extensions = new Set(formatCapabilities.flatMap((entry) => entry.extensions))
    for (const extension of ['.png', '.jpeg', '.webp', '.svg', '.psd', '.psb', '.tiff', '.pdf', '.gif', '.apng', '.avif']) {
      expect(extensions.has(extension), extension).toBe(true)
    }
  })

  it('does not overstate flattened or preview-only workflows', () => {
    expect(formatCapabilities.find((entry) => entry.id === 'pdf')).toMatchObject({ import: 'rasterized', export: 'rasterized' })
    expect(formatCapabilities.find((entry) => entry.id === 'raw')).toMatchObject({ import: 'converted', export: 'unsupported' })
    expect(formatCapabilities.find((entry) => entry.id === 'studio')).toMatchObject({ import: 'editable', export: 'editable' })
  })
})
