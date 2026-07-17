import { describe, expect, it } from 'vitest'
import { countMarkerNumber, countsCsv } from './counts'
import type { DocumentCounts } from './types'

const counts: DocumentCounts = {
  groups: [{ id: 'a', name: 'People, seated', color: '#facc15' }, { id: 'b', name: 'Signs', color: '#22d3ee' }],
  markers: [
    { id: 'one', groupId: 'a', x: 10, y: 20, label: 'Left "guest"' },
    { id: 'two', groupId: 'b', x: 30, y: 40, label: '' },
    { id: 'three', groupId: 'a', x: 50, y: 60, label: 'Right guest' },
  ],
  activeGroupId: 'a',
}

describe('count records', () => {
  it('numbers markers independently within each group', () => {
    expect(countMarkerNumber(counts.markers, counts.markers[2])).toBe(2)
    expect(countMarkerNumber(counts.markers, counts.markers[1])).toBe(1)
  })

  it('exports group, label, and position data as escaped CSV', () => {
    expect(countsCsv(counts)).toContain('"People, seated",1,"Left ""guest""",10,20')
    expect(countsCsv(counts)).toContain('Signs,1,,30,40')
  })
})
