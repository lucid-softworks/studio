import { describe, expect, it } from 'vitest'
import { createShapeLayer, createTextLayer, initialDocument } from '../presets'
import { supportsWorkerComposition } from './worker-composition'

describe('worker composition eligibility', () => {
  it('keeps bitmap-safe documents off the main thread', () => {
    expect(supportsWorkerComposition({ ...initialDocument, layers: [createShapeLayer('ellipse', 0)] })).toBe(true)
  })

  it('keeps text on the main thread until worker font resources are transferable', () => {
    expect(supportsWorkerComposition({ ...initialDocument, layers: [createTextLayer(0)] })).toBe(false)
  })
})
