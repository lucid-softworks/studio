import { describe, expect, it, vi } from 'vitest'
import type { SourceImage } from '../runtime-assets'
import { RenderResourceRegistry } from './render-resource-registry'

function source(revision = 0) {
  return { name: 'asset', revision } as SourceImage
}

describe('render resource registry', () => {
  it('shares a backend resource until its source revision changes', () => {
    const registry = new RenderResourceRegistry()
    const asset = source()
    const factory = vi.fn((value: SourceImage) => ({ resource: { revision: value.revision } }))

    const first = registry.resolve('canvas2d', 'asset-1', asset, factory)
    const second = registry.resolve('canvas2d', 'asset-1', asset, factory)
    asset.revision = 1
    const revised = registry.resolve('canvas2d', 'asset-1', asset, factory)

    expect(first).toBe(second)
    expect(revised).not.toBe(first)
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('keeps backend resources separate and disposes invalidated assets', () => {
    const registry = new RenderResourceRegistry()
    const asset = source()
    const disposeCanvas = vi.fn()
    const disposeGpu = vi.fn()

    registry.resolve('canvas2d', 'asset-1', asset, () => ({ resource: 'canvas', dispose: disposeCanvas }))
    registry.resolve('typegpu', 'asset-1', asset, () => ({ resource: 'texture', dispose: disposeGpu }))
    registry.invalidateAsset('asset-1')

    expect(disposeCanvas).toHaveBeenCalledOnce()
    expect(disposeGpu).toHaveBeenCalledOnce()
  })

  it('prunes deleted assets without disturbing live resources', () => {
    const registry = new RenderResourceRegistry()
    const removed = vi.fn()
    const retained = vi.fn()

    registry.resolve('typegpu', 'removed', source(), () => ({ resource: 'removed', dispose: removed }))
    registry.resolve('typegpu', 'retained', source(), () => ({ resource: 'retained', dispose: retained }))
    registry.prune('typegpu', new Set(['retained']))

    expect(removed).toHaveBeenCalledOnce()
    expect(retained).not.toHaveBeenCalled()
  })

  it('evicts least-recently-used resources within entry and byte budgets', () => {
    const registry = new RenderResourceRegistry({ maxEntriesPerBackend: 2, maxBytesPerBackend: 10 })
    const disposeA = vi.fn()
    const disposeB = vi.fn()
    const disposeC = vi.fn()
    const sourceA = source()

    registry.resolve('typegpu', 'a', sourceA, () => ({ resource: 'a', dispose: disposeA, byteSize: 4 }))
    registry.resolve('typegpu', 'b', source(), () => ({ resource: 'b', dispose: disposeB, byteSize: 4 }))
    registry.resolve('typegpu', 'a', sourceA, () => ({ resource: 'unused' }))
    registry.resolve('typegpu', 'c', source(), () => ({ resource: 'c', dispose: disposeC, byteSize: 7 }))

    expect(disposeA).toHaveBeenCalledOnce()
    expect(disposeB).toHaveBeenCalledOnce()
    expect(disposeC).not.toHaveBeenCalled()
    expect(registry.usage('typegpu')).toEqual({ entries: 1, bytes: 7 })
  })

  it('re-evaluates dynamic resource sizes and evicts deterministically', () => {
    const registry = new RenderResourceRegistry({ maxEntriesPerBackend: 3, maxBytesPerBackend: 8 })
    let dynamicBytes = 2
    const disposeA = vi.fn()
    const disposeB = vi.fn()
    const a = source()
    const b = source()

    registry.resolve('canvas2d', 'a', a, () => ({ resource: 'a', dispose: disposeA, byteSize: () => dynamicBytes }))
    registry.resolve('canvas2d', 'b', b, () => ({ resource: 'b', dispose: disposeB, byteSize: 2 }))
    dynamicBytes = 7
    registry.enforceBudget('canvas2d', 'a')

    expect(disposeA).not.toHaveBeenCalled()
    expect(disposeB).toHaveBeenCalledOnce()
    expect(registry.usage('canvas2d')).toEqual({ entries: 1, bytes: 7 })
  })
})
