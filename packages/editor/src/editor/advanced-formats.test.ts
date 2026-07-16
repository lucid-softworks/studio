import { describe, expect, it } from 'vitest'
import { advancedFormatForFile } from './advanced-formats'

describe('advanced format routing', () => {
  it('routes local codecs by extension and MIME type', () => {
    expect(advancedFormatForFile({ name: 'scan.TIFF', type: '' })).toBe('tiff')
    expect(advancedFormatForFile({ name: 'negative.dng', type: '' })).toBe('dng')
    expect(advancedFormatForFile({ name: 'untitled', type: 'application/pdf' })).toBe('pdf')
    expect(advancedFormatForFile({ name: 'photo.avif', type: 'image/avif' })).toBe('avif')
  })

  it('does not claim ordinary image or unknown formats', () => {
    expect(advancedFormatForFile({ name: 'photo.png', type: 'image/png' })).toBeNull()
    expect(advancedFormatForFile({ name: 'archive.zip', type: 'application/zip' })).toBeNull()
  })
})
