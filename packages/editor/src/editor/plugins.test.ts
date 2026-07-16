import { describe, expect, it } from 'vitest'
import { applyColorMatrix, normalizePlugins } from './plugins'

describe('local plugin hooks', () => {
  it('normalizes every declarative hook type', () => {
    const plugin = normalizePlugins([{ app: 'studio-plugin', version: 1, id: 'demo', name: 'Demo', hooks: { importers: [{ id: 'raw', label: 'Raw', extensions: ['.foo'] }], exporters: [{ id: 'web', label: 'Web', format: 'webp' }], filters: [{ id: 'identity', label: 'Identity', matrix: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0] }], panels: [{ id: 'help', label: 'Help', description: 'Local' }], tools: [{ id: 'ink', label: 'Ink', target: 'brush', mark: 'I' }] } }])[0]
    expect(plugin.hooks.importers[0].extensions).toEqual(['foo'])
    expect(plugin.hooks.exporters[0].format).toBe('webp')
    expect(plugin.hooks.panels[0].description).toBe('Local')
    expect(plugin.hooks.tools[0].target).toBe('brush')
  })

  it('applies declarative color matrices locally', () => {
    const matrix = [-1, 0, 0, 0, 1, 0, -1, 0, 0, 1, 0, 0, -1, 0, 1, 0, 0, 0, 1, 0]
    expect([...applyColorMatrix(new Uint8ClampedArray([10, 20, 30, 40]), matrix)]).toEqual([245, 235, 225, 40])
  })
})
