import { describe, expect, it } from 'vitest'
import { createSmartObjectLayer } from './presets'
import { affineTransformFromQuad, quadBounds, smartObjectBytesHash, smartObjectDisplayQuad } from './smart-objects'

describe('smart-object transforms', () => {
  it('converts PSD corner coordinates to an affine source matrix', () => {
    expect(affineTransformFromQuad([10, 20, 110, 30, 130, 90, 30, 80], 100, 60)).toEqual([1, 0.1, 1 / 3, 1, 10, 20])
  })

  it('composes non-destructive move, rotate, and scale over the source matrix', () => {
    const layer = createSmartObjectLayer('asset', 'Placed', 100, 50, { kind: 'embedded', fileName: 'placed.psb' })
    layer.transformMatrix = [1, 0, 0, 1, 20, 30]
    layer.position = { x: 0.1, y: 0 }
    layer.scale = 200
    const quad = smartObjectDisplayQuad(layer, 200, 100)!

    expect(quadBounds(quad)).toEqual({ x: -10, y: 5, width: 200, height: 100 })
    expect(layer.transformMatrix).toEqual([1, 0, 0, 1, 20, 30])
  })

  it('creates deterministic content hashes that change with source bytes', () => {
    expect(smartObjectBytesHash(Uint8Array.from([1, 2, 3]))).toBe(smartObjectBytesHash(Uint8Array.from([1, 2, 3])))
    expect(smartObjectBytesHash(Uint8Array.from([1, 2, 3]))).not.toBe(smartObjectBytesHash(Uint8Array.from([1, 2, 4])))
  })
})
