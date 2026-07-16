import { describe, expect, it, vi } from 'vitest'
import { generateLinearGradient } from './raster-worker-ops'

describe('raster worker operations', () => {
  it('applies gradient pixels only through the transformed selection mask', () => {
    const before = new Uint8ClampedArray(3 * 4)
    before.set([10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255])
    const selection = new Uint8ClampedArray(3 * 4)
    selection[7] = 128
    selection[11] = 255
    const progress = vi.fn()
    const after = generateLinearGradient({
      data: before.buffer,
      width: 3,
      height: 1,
      start: { x: 0, y: 0 },
      end: { x: 2, y: 0 },
      stops: [{ position: 0, color: [0, 0, 0, 255] }, { position: 100, color: [255, 255, 255, 255] }],
      selection: {
        data: selection.buffer,
        width: 3,
        height: 1,
        target: { surfaceWidth: 3, surfaceHeight: 1, bounds: { x: 0, y: 0, width: 3, height: 1, rotation: 0 } },
      },
    }, progress)

    expect([...after]).toEqual([10, 20, 30, 255, 69, 74, 79, 255, 255, 255, 255, 255])
    expect(progress).toHaveBeenLastCalledWith(1)
  })
})
