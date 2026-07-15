import { describe, expect, it } from 'vitest'
import { rulerStep, rulerValues } from './canvas-ruler-scale'

describe('canvas rulers', () => {
  it('chooses readable document-space intervals for the current scale', () => {
    expect(rulerStep(1)).toBe(100)
    expect(rulerStep(0.5)).toBe(200)
    expect(rulerStep(2)).toBe(50)
  })

  it('includes negative and positive ticks around the canvas origin', () => {
    expect(rulerValues(-24, 24, 10)).toEqual([-30, -20, -10, 0, 10, 20])
  })
})
