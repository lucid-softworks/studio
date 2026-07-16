export type PerformanceDurationMetric = 'pointer-latency' | 'render' | 'save' | 'export'

export type MetricSummary = {
  samples: number
  medianMs: number
  p95Ms: number
  maxMs: number
}

export type PerformanceSnapshot = {
  durationMs: number
  durations: Record<PerformanceDurationMetric, MetricSummary>
  renderedFrames: number
  droppedFrames: number
  renderCount: number
  peakMemoryBytes: number | null
}

const durationMetrics: PerformanceDurationMetric[] = ['pointer-latency', 'render', 'save', 'export']

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0
  const sorted = values.toSorted((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))]
}

function summarize(values: number[]): MetricSummary {
  return {
    samples: values.length,
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maxMs: values.length ? Math.max(...values) : 0,
  }
}

export class EditorPerformanceMetrics {
  private readonly now: () => number
  private startedAt: number
  private readonly samples = new Map<PerformanceDurationMetric, number[]>(durationMetrics.map((metric) => [metric, []]))
  private lastFrameAt: number | null = null
  private frames = 0
  private dropped = 0
  private renders = 0
  private peakMemory: number | null = null

  constructor(now: () => number = () => performance.now()) {
    this.now = now
    this.startedAt = now()
  }

  recordDuration(metric: PerformanceDurationMetric, durationMs: number) {
    if (Number.isFinite(durationMs) && durationMs >= 0) this.samples.get(metric)!.push(durationMs)
  }

  start(metric: PerformanceDurationMetric) {
    const startedAt = this.now()
    return () => this.recordDuration(metric, this.now() - startedAt)
  }

  recordPointer(eventTimestamp: number, handledAt = this.now()) {
    this.recordDuration('pointer-latency', Math.max(0, handledAt - eventTimestamp))
  }

  recordFrame(timestamp: number, targetFrameMs = 1000 / 60) {
    if (this.lastFrameAt !== null) this.dropped += Math.max(0, Math.round((timestamp - this.lastFrameAt) / targetFrameMs) - 1)
    this.lastFrameAt = timestamp
    this.frames += 1
  }

  recordRender(durationMs?: number) {
    this.renders += 1
    if (durationMs !== undefined) this.recordDuration('render', durationMs)
  }

  recordMemory(bytes: number | null | undefined) {
    if (bytes !== null && bytes !== undefined && Number.isFinite(bytes) && bytes >= 0) this.peakMemory = Math.max(this.peakMemory ?? 0, bytes)
  }

  reset() {
    this.startedAt = this.now()
    for (const values of this.samples.values()) values.length = 0
    this.lastFrameAt = null
    this.frames = 0
    this.dropped = 0
    this.renders = 0
    this.peakMemory = null
  }

  snapshot(): PerformanceSnapshot {
    return {
      durationMs: Math.max(0, this.now() - this.startedAt),
      durations: Object.fromEntries(durationMetrics.map((metric) => [metric, summarize(this.samples.get(metric)!)])) as Record<PerformanceDurationMetric, MetricSummary>,
      renderedFrames: this.frames,
      droppedFrames: this.dropped,
      renderCount: this.renders,
      peakMemoryBytes: this.peakMemory,
    }
  }
}
