import { describe, expect, it } from 'vitest'
import { normalizeCustomPatterns } from './patterns'

describe('pattern library', () => {
  it('normalizes persisted procedural patterns and rejects malformed entries', () => {
    expect(normalizeCustomPatterns([
      { id: 'one', name: ' Blueprint ', kind: 'grid', color: '#38BDF8', opacity: 120, size: 8 },
      { id: 'duplicate', name: 'blueprint', kind: 'grid', color: '#38bdf8', opacity: 100, size: 12 },
      { name: 'Unsupported', kind: 'noise', color: '#ffffff', opacity: 20, size: 40 },
      { name: '', kind: 'dots', color: '#ffffff', opacity: 20, size: 40 },
    ])).toEqual([{ id: 'one', name: 'Blueprint', kind: 'grid', color: '#38bdf8', opacity: 100, size: 12 }])
  })
})
