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

function crop(source: ImageData, x: number, y: number, width: number, height: number) {
  const result = new ImageData(width, height)
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * source.width + x) * 4
    result.data.set(source.data.subarray(start, start + width * 4), row * width * 4)
  }
  return result
}

function paste(target: ImageData, source: ImageData, x: number, y: number) {
  for (let row = 0; row < source.height; row += 1) {
    const start = ((y + row) * target.width + x) * 4
    target.data.set(source.data.subarray(row * source.width * 4, (row + 1) * source.width * 4), start)
  }
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

  it('targets tonal ranges while dodge and burn preserve protected color ratios', () => {
    const darkShadow = solid(48, 24, 12)
    const darkHighlight = solid(48, 24, 12)
    applyRetouchStamp(darkShadow, solid(0, 0, 0), 2, 2, 2, { mode: 'dodge', color: '#000000', strength: 100, pattern, toneRange: 'shadows', protectTones: true })
    applyRetouchStamp(darkHighlight, solid(0, 0, 0), 2, 2, 2, { mode: 'dodge', color: '#000000', strength: 100, pattern, toneRange: 'highlights', protectTones: true })
    expect(darkShadow.data[48]).toBeGreaterThan(darkHighlight.data[48])
    expect(darkShadow.data[48] / darkShadow.data[49]).toBeCloseTo(2, 1)

    const lightHighlight = solid(220, 180, 120)
    const lightShadow = solid(220, 180, 120)
    applyRetouchStamp(lightHighlight, solid(0, 0, 0), 2, 2, 2, { mode: 'burn', color: '#000000', strength: 100, pattern, toneRange: 'highlights', protectTones: true })
    applyRetouchStamp(lightShadow, solid(0, 0, 0), 2, 2, 2, { mode: 'burn', color: '#000000', strength: 100, pattern, toneRange: 'shadows', protectTones: true })
    expect(lightHighlight.data[48]).toBeLessThan(lightShadow.data[48])
  })

  it('supports saturate, desaturate, and vibrance-aware sponge behavior', () => {
    const saturated = solid(180, 100, 100)
    const desaturated = solid(180, 100, 100)
    applyRetouchStamp(saturated, solid(0, 0, 0), 2, 2, 2, { mode: 'sponge', color: '#000000', strength: 100, pattern, spongeMode: 'saturate' })
    applyRetouchStamp(desaturated, solid(0, 0, 0), 2, 2, 2, { mode: 'sponge', color: '#000000', strength: 100, pattern, spongeMode: 'desaturate' })
    expect(saturated.data[48] - saturated.data[49]).toBeGreaterThan(80)
    expect(desaturated.data[48] - desaturated.data[49]).toBe(0)

    const vivid = solid(240, 20, 20)
    const normal = solid(240, 20, 20)
    applyRetouchStamp(vivid, solid(0, 0, 0), 2, 2, 2, { mode: 'sponge', color: '#000000', strength: 100, pattern, spongeMode: 'saturate', vibrance: true })
    applyRetouchStamp(normal, solid(0, 0, 0), 2, 2, 2, { mode: 'sponge', color: '#000000', strength: 100, pattern, spongeMode: 'saturate', vibrance: false })
    expect(vivid.data[49]).toBeGreaterThan(normal.data[49])
  })

  it.each(['blur', 'pattern-stamp'] as const)('matches full-surface %s output when processing a padded dirty region', (mode) => {
    const original = new ImageData(12, 12)
    for (let y = 0; y < original.height; y += 1) for (let x = 0; x < original.width; x += 1) {
      original.data.set([(x * 31) % 256, (y * 47) % 256, ((x + y) * 23) % 256, 255], (y * original.width + x) * 4)
    }
    const full = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height)
    const fullSource = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height)
    applyRetouchStamp(full, fullSource, 6, 6, 3, { mode, color: '#f97316', strength: 75, pattern })

    const regional = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height)
    const region = crop(regional, 2, 2, 9, 9)
    const source = crop(original, 2, 2, 9, 9)
    applyRetouchStamp(region, source, 4, 4, 3, { mode, color: '#f97316', strength: 75, pattern, origin: { x: 2, y: 2 } })
    paste(regional, region, 2, 2)

    expect(regional.data).toEqual(full.data)
  })
})
