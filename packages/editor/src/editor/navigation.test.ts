import { describe, expect, it } from 'vitest'
import { navigatorPointToScroll, scrollMetricsToNavigatorViewport } from './navigation'

describe('navigator geometry', () => {
  const metrics = { scrollLeft: 500, scrollTop: 250, scrollWidth: 2000, scrollHeight: 1000, clientWidth: 800, clientHeight: 400 }

  it('maps the visible stage into normalized navigator bounds', () => {
    expect(scrollMetricsToNavigatorViewport(metrics)).toEqual({ x: 0.25, y: 0.25, width: 0.4, height: 0.4 })
  })

  it('centers navigator points and clamps document edges', () => {
    expect(navigatorPointToScroll({ x: 0.5, y: 0.5 }, metrics)).toEqual({ left: 600, top: 300 })
    expect(navigatorPointToScroll({ x: 0, y: 0 }, metrics)).toEqual({ left: 0, top: 0 })
    expect(navigatorPointToScroll({ x: 1, y: 1 }, metrics)).toEqual({ left: 1200, top: 600 })
  })
})
