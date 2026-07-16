import { describe, expect, it } from 'vitest'
import { snapTranslation } from './snapping'

describe('snapTranslation', () => {
  it('snaps layer edges and centres to nearby targets', () => {
    expect(snapTranslation({ x: 10, y: 20, width: 40, height: 20 }, 47, 1, [100], [30], undefined, 4)).toEqual({ dx: 50, dy: 0, xGuide: 100, yGuide: 30 })
  })

  it('uses configurable grid intersections and ignores distant targets', () => {
    expect(snapTranslation({ x: 2, y: 3, width: 20, height: 20 }, 6, 6, [], [], 10, 2)).toEqual({ dx: 8, dy: 7, xGuide: 10, yGuide: 10 })
    expect(snapTranslation({ x: 2, y: 3, width: 20, height: 20 }, 30, 30, [100], [100], undefined, 2)).toEqual({ dx: 30, dy: 30, xGuide: undefined, yGuide: undefined })
  })
})
