import { describe, expect, it } from 'vitest'
import { clampPanelWidth } from './panel-layout'

describe('panel resizing', () => {
  it('rounds valid widths and clamps workspace extremes', () => {
    expect(clampPanelWidth(318.6)).toBe(319)
    expect(clampPanelWidth(80)).toBe(220)
    expect(clampPanelWidth(900)).toBe(480)
  })
})
