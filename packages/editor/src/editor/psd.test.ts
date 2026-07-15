import { describe, expect, it } from 'vitest'
import { psdLayerNamesInEditorOrder } from './psd'
import type { Layer } from 'ag-psd'

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
})
