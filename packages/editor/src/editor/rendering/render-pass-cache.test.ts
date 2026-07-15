import { describe, expect, it } from 'vitest'
import { createRasterLayer, createShapeLayer, createTextLayer, initialDocument } from '../presets'
import type { AssetMap, SourceImage } from '../runtime-assets'
import { backgroundPassSignature, layerPassSignature, RenderPassCache } from './render-pass-cache'

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
  })

  it('caches backgrounds and shapes but leaves text dependent on live font resources', () => {
    expect(backgroundPassSignature(initialDocument, {})).toBe(backgroundPassSignature(initialDocument, {}))
    expect(layerPassSignature(createShapeLayer('rectangle', 0), {})).not.toBeNull()
    expect(layerPassSignature(createTextLayer(0), {})).toBeNull()
  })
})
