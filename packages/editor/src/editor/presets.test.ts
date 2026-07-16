import { describe, expect, it } from 'vitest'
import { createBlankDocumentModel, initialDocument } from './presets'

describe('blank documents', () => {
  it('start with one selected transparent raster layer without mutating the base preset', () => {
    const first = createBlankDocumentModel()
    const second = createBlankDocumentModel()

    expect(first.document.background.kind).toBe('transparent')
    expect(first.document.layers).toHaveLength(1)
    expect(first.document.layers[0]).toMatchObject({
      type: 'raster',
      name: 'Layer 1',
      assetId: first.assetId,
      width: first.document.canvasSize.width,
      height: first.document.canvasSize.height,
      groupId: null,
      stackOrder: 0,
    })
    expect(first.document.selectedLayerId).toBe(first.document.layers[0].id)
    expect(first.document.selectedLayerIds).toEqual([first.document.layers[0].id])
    expect(second.assetId).not.toBe(first.assetId)
    expect(second.document.layers[0].id).not.toBe(first.document.layers[0].id)
    expect(initialDocument.layers).toEqual([])
  })
})
