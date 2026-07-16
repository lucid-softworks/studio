import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PerspectiveCropOverlay } from './PerspectiveCropOverlay'

const value = [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 700 }, { x: 100, y: 700 }] as const

describe('PerspectiveCropOverlay', () => {
  it('does not leak its default crop rectangle while the tool is inactive', () => {
    const markup = renderToStaticMarkup(<PerspectiveCropOverlay canvasRef={{ current: null }} enabled={false} value={[...value]} onChange={vi.fn()} />)
    expect(markup).toBe('')
  })

  it('renders its handles when the perspective crop tool is active', () => {
    const markup = renderToStaticMarkup(<PerspectiveCropOverlay canvasRef={{ current: null }} enabled value={[...value]} onChange={vi.fn()} />)
    expect(markup).toContain('aria-label="Perspective crop surface"')
    expect(markup.match(/<circle/g)).toHaveLength(4)
  })
})
