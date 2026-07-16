import type { PerformanceFixtureId } from './performance-fixtures'

export type BrowserPerformanceBudget = {
  readyMs: number
  renderP95Ms: number
  pointerP95Ms: number
  saveP95Ms: number
}

export const browserPerformanceBudgets: Record<PerformanceFixtureId, BrowserPerformanceBudget> = {
  '2k': { readyMs: 5_000, renderP95Ms: 180, pointerP95Ms: 50, saveP95Ms: 2_000 },
  '4k': { readyMs: 8_000, renderP95Ms: 450, pointerP95Ms: 75, saveP95Ms: 3_000 },
  '8k': { readyMs: 20_000, renderP95Ms: 2_500, pointerP95Ms: 125, saveP95Ms: 5_000 },
  'deep-layers': { readyMs: 12_000, renderP95Ms: 1_000, pointerP95Ms: 100, saveP95Ms: 5_000 },
  'high-depth': { readyMs: 12_000, renderP95Ms: 750, pointerP95Ms: 100, saveP95Ms: 4_000 },
  animation: { readyMs: 10_000, renderP95Ms: 750, pointerP95Ms: 100, saveP95Ms: 4_000 },
}
