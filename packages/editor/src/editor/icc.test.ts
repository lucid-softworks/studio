import { describe, expect, it } from 'vitest'
import { bakeIccColorLookup } from './icc'
import { iccLookupProfile } from './fixtures/icc-fixtures'

describe('ICC Color Lookup previews', () => {
  it.each(['deviceLinkProfile', 'abstractProfile'] as const)('bakes an embedded %s to a local preview cube', async (lookupType) => {
    const profile = iccLookupProfile(lookupType === 'deviceLinkProfile' ? 'link' : 'abst')
    const result = await bakeIccColorLookup({ type: 'color lookup', lookupType, dither: false, profile: [...profile] }, 3)

    expect(result.iccPreview?.size).toBe(3)
    expect(result.iccPreview?.data).toHaveLength(81)
    if (lookupType === 'deviceLinkProfile') {
      expect(result.iccPreview?.data[0]).toBe(255)
      expect(result.iccPreview?.data[6]).toBe(0)
    }
  })
})
