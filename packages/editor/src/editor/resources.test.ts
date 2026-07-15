import { describe, expect, it } from 'vitest'
import { brushAlpha } from './resources'

describe('brush resource conversion', () => {
  it('uses source alpha for transparent image tips', () => {
    expect(brushAlpha(20, 40, 60, 96, true)).toBe(96)
  })

  it('turns black into paint and white into transparency for opaque images', () => {
    expect(brushAlpha(0, 0, 0, 255, false)).toBe(255)
    expect(brushAlpha(255, 255, 255, 255, false)).toBe(0)
  })
})
