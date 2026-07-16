import { describe, expect, it } from 'vitest'
import { animationDocumentAt, captureLayerKeyframe, normalizeAnimation } from './animation'
import { createRasterLayer, initialDocument } from './presets'

describe('animation model', () => {
  it('interpolates layer transforms on the timeline', () => {
    const layer = createRasterLayer('asset', 'Layer', 100, 100)
    const document = { ...structuredClone(initialDocument), layers: [layer], animation: { ...normalizeAnimation(undefined), mode: 'timeline' as const, keyframes: [{ ...captureLayerKeyframe(layer, 0), position: { x: 0, y: 0 } }, { ...captureLayerKeyframe(layer, 2), position: { x: 1, y: 0 }, opacity: 0 }] } }
    const preview = animationDocumentAt(document, { frameIndex: 0, time: 1 })
    expect(preview.layers[0].position.x).toBeCloseTo(0.5)
    expect(preview.layers[0].opacity).toBeCloseTo(50)
  })

  it('shows captured frame visibility with translucent adjacent onions', () => {
    const first = { ...createRasterLayer('asset-a', 'First', 100, 100), id: 'first' }
    const second = { ...createRasterLayer('asset-b', 'Second', 100, 100), id: 'second' }
    const animation = { ...normalizeAnimation(undefined), onionSkin: true, frames: [{ id: 'a', name: 'A', delayMs: 100, visibleLayerIds: ['first'] }, { id: 'b', name: 'B', delayMs: 100, visibleLayerIds: ['second'] }] }
    const preview = animationDocumentAt({ ...structuredClone(initialDocument), layers: [first, second], animation }, { frameIndex: 0, time: 0 })
    expect(preview.layers.some((layer) => layer.id === 'second' && !layer.visible)).toBe(true)
    expect(preview.layers.some((layer) => layer.id.startsWith('onion-') && layer.visible)).toBe(true)
  })
})
