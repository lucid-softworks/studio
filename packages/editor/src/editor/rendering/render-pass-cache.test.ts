import { describe, expect, it } from 'vitest'
import { createLayerGroup, createRasterLayer, createShapeLayer, createTextLayer, initialDocument } from '../presets'
import type { AssetMap, SourceImage } from '../runtime-assets'
import { backgroundPassSignature, groupPassSignature, layerPassSignature, layerPassStructureSignature, RenderPassCache } from './render-pass-cache'

function source(revision = 0): SourceImage {
  return {
    name: 'fixture',
    revision,
    element: { naturalWidth: 320, naturalHeight: 200 } as HTMLImageElement,
  }
}

describe('native render pass cache', () => {
  it('reuses matching signatures and invalidates changed passes', () => {
    const cache = new RenderPassCache()

    expect(cache.shouldRender(0, 'background')).toBe(true)
    expect(cache.shouldRender(0, 'background')).toBe(false)
    expect(cache.shouldRender(0, 'background', true)).toBe(true)
    expect(cache.shouldRender(0, 'changed')).toBe(true)
  })

  it('tracks runtime asset identity and revision', () => {
    const layer = createRasterLayer('raster', 'Raster', 320, 200)
    const firstAssets: AssetMap = { raster: source(0) }
    const replacementAssets: AssetMap = { raster: source(0) }

    expect(layerPassSignature(layer, firstAssets)).toBe(layerPassSignature(layer, firstAssets))
    expect(layerPassSignature(layer, replacementAssets)).not.toBe(layerPassSignature(layer, firstAssets))
    const beforeRevision = layerPassSignature(layer, firstAssets)
    firstAssets.raster.revision = 1
    expect(layerPassSignature(layer, firstAssets)).not.toBe(beforeRevision)
    expect(layerPassStructureSignature(layer, firstAssets)).toBe(layerPassStructureSignature(layer, { raster: { ...firstAssets.raster, revision: 2 } }))
  })

  it('invalidates only tiles touched by revisioned raster edits', () => {
    const cache = new RenderPassCache()
    const first = cache.prepare(0, 'revision:1', 700, 500, { structureSignature: 'raster', revision: 1 })
    const second = cache.prepare(0, 'revision:3', 700, 500, {
      structureSignature: 'raster',
      revision: 3,
      dirtyRegions: [
        { revision: 2, region: { x: 270, y: 40, width: 12, height: 12 } },
        { revision: 3, region: { x: 300, y: 60, width: 12, height: 12 } },
      ],
    })

    expect(first.shouldRender).toBe(true)
    expect(first.regions).toHaveLength(6)
    expect(second).toEqual({ shouldRender: true, regions: [{ x: 256, y: 0, width: 256, height: 256 }] })
    expect(cache.prepare(0, 'revision:3', 700, 500, { structureSignature: 'raster', revision: 3 })).toEqual({ shouldRender: false, regions: [] })
  })

  it('falls back to a full pass when structure changes or dirty history is incomplete', () => {
    const cache = new RenderPassCache()
    cache.prepare(0, 'revision:1', 700, 500, { structureSignature: 'before', revision: 1 })

    expect(cache.prepare(0, 'revision:2', 700, 500, { structureSignature: 'after', revision: 2, dirtyRegions: [{ revision: 2, region: { x: 0, y: 0, width: 1, height: 1 } }] }).regions).toHaveLength(6)
    expect(cache.prepare(0, 'revision:3', 700, 500, { structureSignature: 'after', revision: 3 }).regions).toHaveLength(6)
  })

  it('evicts least-recently-used tile entries within a bounded cache', () => {
    const cache = new RenderPassCache(2)
    cache.prepare(0, 'first', 512, 256)
    cache.prepare(1, 'second', 512, 256)

    expect(cache.cachedTileCount).toBe(2)
    expect(cache.prepare(0, 'first', 512, 256).shouldRender).toBe(true)
    expect(cache.cachedTileCount).toBe(2)
  })

  it('caches backgrounds and shapes but leaves text dependent on live font resources', () => {
    expect(backgroundPassSignature(initialDocument, {})).toBe(backgroundPassSignature(initialDocument, {}))
    expect(layerPassSignature(createShapeLayer('rectangle', 0), {})).not.toBeNull()
    expect(layerPassSignature(createTextLayer(0), {})).toBeNull()
  })

  it('invalidates isolated group passes when descendants or assets change', () => {
    const group = { ...createLayerGroup(0), id: 'group' }
    const nested = { ...createLayerGroup(1), id: 'nested', parentId: group.id }
    const layer = { ...createRasterLayer('raster', 'Raster', 320, 200), id: 'layer', groupId: nested.id }
    const assets: AssetMap = { raster: source(0) }
    const document = { ...initialDocument, groups: [group, nested], layers: [layer] }
    const before = groupPassSignature(document, group.id, assets)

    expect(before).toBe(groupPassSignature(document, group.id, assets))
    assets.raster.revision = 1
    expect(groupPassSignature(document, group.id, assets)).not.toBe(before)
    expect(groupPassSignature({ ...document, layers: [{ ...layer, opacity: 50 }] }, group.id, assets)).not.toBe(before)
  })
})
