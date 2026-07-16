import { describe, expect, it } from 'vitest'
import { clampFloatingPanelPosition, clampPanelWidth, defaultWorkspaceLayout, normalizeWorkspaceLayout, reorderUtilityPanels } from './panel-layout'

describe('panel resizing', () => {
  it('rounds valid widths and clamps workspace extremes', () => {
    expect(clampPanelWidth(318.6)).toBe(319)
    expect(clampPanelWidth(80)).toBe(220)
    expect(clampPanelWidth(900)).toBe(480)
  })

  it('normalizes persisted layouts without trusting malformed local data', () => {
    expect(normalizeWorkspaceLayout({
      propertiesOnLeft: false,
      panelWidths: { properties: 100, layers: Number.NaN },
      collapsedPanels: { properties: true, layers: 'no' },
    })).toEqual({
      propertiesOnLeft: false,
      panelWidths: { properties: 220, layers: 258 },
      collapsedPanels: { properties: true, layers: false },
      activeUtilityPanel: 'layers',
      utilityPanelOrder: ['layers', 'channels', 'history', 'navigator', 'histogram', 'swatches', 'gradients', 'patterns', 'libraries', 'info'],
      utilityPanelFloating: false,
      floatingPanelPosition: { x: 960, y: 84 },
    })
    expect(normalizeWorkspaceLayout(null)).toEqual(defaultWorkspaceLayout)
  })

  it('reorders utility tabs and keeps floating headers recoverable', () => {
    expect(reorderUtilityPanels(['layers', 'channels', 'history', 'navigator', 'histogram', 'swatches', 'gradients', 'patterns', 'libraries', 'info'], 'info', 'history')).toEqual(['layers', 'channels', 'info', 'history', 'navigator', 'histogram', 'swatches', 'gradients', 'patterns', 'libraries'])
    expect(clampFloatingPanelPosition({ x: 2000, y: -20 }, 320, { width: 1440, height: 900 })).toEqual({ x: 1392, y: 48 })
  })
})
