import { describe, expect, it } from 'vitest'
import { normalizeCustomSwatches, normalizeHexColor } from './swatches'

describe('swatch library', () => {
  it('normalizes colors, removes duplicates, and rejects invalid persisted values', () => {
    expect(normalizeHexColor(' #AABBCC ')).toBe('#aabbcc')
    expect(normalizeHexColor('red', '#123456')).toBe('#123456')
    expect(normalizeCustomSwatches(['#ABCDEF', '#abcdef', '#000000', 'bad'])).toEqual(['#abcdef'])
  })
})
