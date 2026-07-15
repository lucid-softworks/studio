import { describe, expect, it } from 'vitest'
import { normalizeCustomGradients } from './gradients'

describe('gradient library', () => {
  it('normalizes persisted two-color gradients and rejects malformed entries', () => {
    expect(normalizeCustomGradients([
      { id: 'one', name: ' Night ', start: '#AABBCC', end: '#112233' },
      { id: 'duplicate', name: 'night', start: '#aabbcc', end: '#112233' },
      { name: '', start: '#000000', end: '#ffffff' },
    ])).toEqual([{ id: 'one', name: 'Night', start: '#aabbcc', end: '#112233' }])
  })
})
