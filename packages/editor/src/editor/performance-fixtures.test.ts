import { describe, expect, it } from 'vitest'
import { createPerformanceFixture, performanceFixtureDefinitions, performanceFixtureIds } from './performance-fixtures'
import { EditorPerformanceMetrics } from './performance-metrics'
import { browserPerformanceBudgets } from './performance-budgets'

describe('performance fixtures', () => {
  it('provides deterministic documents for every required stress category', () => {
    expect(performanceFixtureIds).toEqual(['2k', '4k', '8k', 'deep-layers', 'high-depth', 'animation'])
    for (const id of performanceFixtureIds) {
      const first = createPerformanceFixture(id)
      const second = createPerformanceFixture(id)
      const definition = performanceFixtureDefinitions[id]
      expect(first.document.canvasSize).toEqual({ width: definition.width, height: definition.height })
      expect(first.document.layers).toHaveLength(definition.layers)
      expect(first.document.layers.map((layer) => layer.id)).toEqual(second.document.layers.map((layer) => layer.id))
      expect(new Set(first.document.layers.map((layer) => layer.id)).size).toBe(definition.layers)
    }
  })

  it('builds deep, high-depth, and animated stress characteristics', () => {
    expect(createPerformanceFixture('deep-layers').document.groups).toHaveLength(32)
    expect(createPerformanceFixture('high-depth').document.bitDepth).toBe(32)
    const animation = createPerformanceFixture('animation').document.animation
    expect(animation?.mode).toBe('timeline')
    expect(animation?.keyframes).toHaveLength(240)
  })

  it('defines supported-browser budgets for every fixture', () => {
    expect(Object.keys(browserPerformanceBudgets)).toEqual(performanceFixtureIds)
    for (const budget of Object.values(browserPerformanceBudgets)) {
      expect(budget.readyMs).toBeGreaterThan(0)
      expect(budget.renderP95Ms).toBeGreaterThan(0)
      expect(budget.pointerP95Ms).toBeGreaterThan(0)
      expect(budget.saveP95Ms).toBeGreaterThan(0)
      expect(budget.gradientCommitMs).toBeGreaterThan(0)
    }
  })
})

describe('performance metrics', () => {
  it('summarizes latency, frames, renders, memory, save, and export measurements', () => {
    let now = 100
    const metrics = new EditorPerformanceMetrics(() => now)
    metrics.recordPointer(96)
    metrics.recordDuration('render', 12)
    metrics.recordDuration('save', 40)
    metrics.recordDuration('export', 55)
    metrics.recordFrame(100)
    metrics.recordFrame(150)
    metrics.recordRender()
    metrics.recordMemory(1024)
    metrics.recordMemory(2048)
    now = 175

    expect(metrics.snapshot()).toEqual({
      durationMs: 75,
      durations: {
        'pointer-latency': { samples: 1, medianMs: 4, p95Ms: 4, maxMs: 4 },
        render: { samples: 1, medianMs: 12, p95Ms: 12, maxMs: 12 },
        save: { samples: 1, medianMs: 40, p95Ms: 40, maxMs: 40 },
        export: { samples: 1, medianMs: 55, p95Ms: 55, maxMs: 55 },
      },
      renderedFrames: 2,
      droppedFrames: 2,
      renderCount: 1,
      peakMemoryBytes: 2048,
    })
  })
})
