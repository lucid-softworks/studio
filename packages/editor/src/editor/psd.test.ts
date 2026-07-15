import { describe, expect, it } from 'vitest'
import { psdBlendMode, psdImportWarnings, psdLayerNamesInEditorOrder } from './psd'
import type { Layer, Psd } from 'ag-psd'

describe('PSD layer ordering', () => {
  it('converts ag-psd top-to-bottom children to the editor bottom-to-top stack', () => {
    const children: Layer[] = [
      { name: 'Top' },
      { name: 'Folder', children: [{ name: 'Folder top' }, { name: 'Folder bottom' }] },
      { name: 'Bottom' },
    ]

    expect(psdLayerNamesInEditorOrder(children)).toEqual([
      'Bottom',
      'Folder / Folder bottom',
      'Folder / Folder top',
      'Top',
    ])
  })

  it('keeps bottom-to-top children in compositor order for nonstandard PSD writers', () => {
    const children: Layer[] = [{ name: 'Background' }, { name: 'Artwork' }]
    expect(psdLayerNamesInEditorOrder(children, '', false)).toEqual(['Background', 'Artwork'])
  })

  it('maps Photoshop blend-mode names onto editor blend modes', () => {
    expect(psdBlendMode('color burn')).toBe('color-burn')
    expect(psdBlendMode('hard light')).toBe('hard-light')
    expect(psdBlendMode('linear light')).toBe('normal')
  })

  it('reports exact compatibility changes with layer paths', () => {
    const psd: Psd = {
      width: 100,
      height: 100,
      bitsPerChannel: 16,
      colorMode: 4,
      children: [{
        name: 'Artwork',
        children: [
          { name: 'Heading', text: {} as NonNullable<Layer['text']> },
          { name: 'Glow', effects: {} },
          { name: 'Blend', blendMode: 'linear light' },
        ],
      }],
      imageResources: { gridAndGuidesInformation: { guides: [{ location: 40, direction: 'vertical' }] } },
    }

    expect(psdImportWarnings(psd)).toEqual(expect.arrayContaining([
      '16-bit channels were converted to 8-bit raster data',
      'The source color mode was converted to RGB',
      'PSD guides were not imported',
      'Editable text was rasterized: Artwork / Heading',
      'Layer effects were not preserved as editable effects: Artwork / Glow',
      'Unsupported “linear light” blending was changed to normal: Artwork / Blend',
    ]))
  })
})
