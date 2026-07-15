import { describe, expect, it } from 'vitest'
import { clampPanelWidth, defaultWorkspaceLayout, normalizeWorkspaceLayout } from './panel-layout'

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
    })
    expect(normalizeWorkspaceLayout(null)).toEqual(defaultWorkspaceLayout)
  })
})
