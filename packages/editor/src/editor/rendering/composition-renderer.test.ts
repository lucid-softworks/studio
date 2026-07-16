import { describe, expect, it } from 'vitest'
import { createRasterLayer, initialDocument } from '../presets'
import { estimateTypeGpuRendererMemory } from './composition-renderer'

describe('composition renderer memory budgets', () => {
  it('accounts for pass canvases, clipping passes, selection, and fixed GPU textures', () => {
    const base = createRasterLayer('base', 'Base', 100, 50)
    const clipped = { ...createRasterLayer('clipped', 'Clipped', 100, 50), clipToBelow: true }
    const document = {
      ...initialDocument,
      canvasPreset: 'custom',
      canvasSize: { width: 100, height: 50 },
      layers: [base, clipped],
      selectedLayerId: clipped.id,
    }

    expect(estimateTypeGpuRendererMemory(document, { showSelection: true })).toEqual({
      passCount: 5,
      passCacheBytes: 100_000,
      textureBytes: 160_000,
    })
  })

  it('does not reserve native resources for unsupported render plans', () => {
    expect(estimateTypeGpuRendererMemory({ ...initialDocument, colorMode: 'cmyk' })).toBeNull()
  })
})
