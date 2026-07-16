import { ImageData as CanvasImageData } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { applyRetouchStamp, sampleAverageColor } from './retouch'

const pattern = { kind: 'dots' as const, color: '#ffffff', opacity: 100, size: 4 }
Object.assign(globalThis, { ImageData: CanvasImageData })

function solid(red: number, green: number, blue: number) {
  const image = new ImageData(5, 5)
  for (let offset = 0; offset < image.data.length; offset += 4) image.data.set([red, green, blue, 255], offset)
  return image
}

describe('local retouch engine', () => {
  it('restores pixels from the history source', () => {
    const image = solid(240, 10, 10)
    const source = solid(10, 20, 30)
    applyRetouchStamp(image, source, 2, 2, 2, { mode: 'history-brush', color: '#000000', strength: 100, pattern })
    expect([...image.data.slice(48, 52)]).toEqual([10, 20, 30, 255])
  })

  it('blurs and samples without changing alpha', () => {
    const image = solid(0, 0, 0)
    image.data.set([255, 255, 255, 255], 48)
    const source = new ImageData(new Uint8ClampedArray(image.data), 5, 5)
    applyRetouchStamp(image, source, 2, 2, 2, { mode: 'blur', color: '#000000', strength: 100, pattern })
    expect(image.data[48]).toBeGreaterThan(0)
    expect(image.data[48]).toBeLessThan(255)
    expect(image.data[51]).toBe(255)
    expect(sampleAverageColor(source, 2, 2, 1)[0]).toBeGreaterThan(0)
  })
})
