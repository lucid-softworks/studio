import { createCanvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { d } from 'typegpu'
import { gpuCompositePixel } from './typegpu-compositor'
import { typeGpuBlendModeCodes, type TypeGpuBlendMode } from './typegpu-blend-modes'

type Pixel = readonly [number, number, number, number]

const backdrop: Pixel = [51, 153, 230, 179]
const source: Pixel = [204, 64, 26, 153]

function canvasPixel(mode: TypeGpuBlendMode): Pixel {
  const canvas = createCanvas(1, 1)
  const context = canvas.getContext('2d')
  context.fillStyle = `rgba(${backdrop[0]}, ${backdrop[1]}, ${backdrop[2]}, ${backdrop[3] / 255})`
  context.fillRect(0, 0, 1, 1)
  context.globalCompositeOperation = mode === 'normal' ? 'source-over' : mode
  context.fillStyle = `rgba(${source[0]}, ${source[1]}, ${source[2]}, ${source[3] / 255})`
  context.fillRect(0, 0, 1, 1)
  return [...context.getImageData(0, 0, 1, 1).data] as unknown as Pixel
}

function gpuPixel(mode: TypeGpuBlendMode): Pixel {
  const backdropAlpha = backdrop[3] / 255
  const sourceAlpha = source[3] / 255
  const result = gpuCompositePixel(
    d.vec4f(
      backdrop[0] / 255 * backdropAlpha,
      backdrop[1] / 255 * backdropAlpha,
      backdrop[2] / 255 * backdropAlpha,
      backdropAlpha,
    ),
    d.vec3f(source[0] / 255, source[1] / 255, source[2] / 255),
    sourceAlpha,
    typeGpuBlendModeCodes[mode],
  )
  return [
    Math.round(result.x / result.w * 255),
    Math.round(result.y / result.w * 255),
    Math.round(result.z / result.w * 255),
    Math.round(result.w * 255),
  ]
}

describe('TypeGPU and Canvas2D pixel parity', () => {
  it('matches the deterministic blend-mode fixture', () => {
    const modes = Object.keys(typeGpuBlendModeCodes) as TypeGpuBlendMode[]
    const canvas = Object.fromEntries(modes.map((mode) => [mode, canvasPixel(mode)]))
    const gpu = Object.fromEntries(modes.map((mode) => [mode, gpuPixel(mode)]))

    expect(canvas).toEqual({
      normal: [154, 92, 91, 225],
      multiply: [77, 79, 90, 225],
      screen: [160, 146, 189, 225],
      overlay: [96, 110, 178, 225],
      darken: [82, 92, 91, 225],
      lighten: [154, 134, 188, 225],
      'color-dodge': [179, 159, 199, 225],
      'color-burn': [58, 61, 80, 225],
      'hard-light': [139, 97, 101, 225],
      'soft-light': [100, 120, 179, 225],
      difference: [129, 103, 176, 225],
      exclusion: [141, 128, 178, 225],
      hue: [169, 105, 104, 225],
      saturation: [82, 134, 188, 225],
      color: [169, 105, 104, 225],
      luminosity: [68, 120, 175, 225],
    })

    for (const mode of modes) {
      gpu[mode].forEach((channel, index) => {
        expect(Math.abs(channel - canvas[mode][index]), `${mode} channel ${index}`).toBeLessThanOrEqual(3)
      })
    }
  })
})
