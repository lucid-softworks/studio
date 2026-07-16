export type NavigatorViewport = { x: number; y: number; width: number; height: number }
export type ScrollViewportMetrics = { scrollLeft: number; scrollTop: number; scrollWidth: number; scrollHeight: number; clientWidth: number; clientHeight: number }

const clamp = (value: number, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value))

export function scrollMetricsToNavigatorViewport(metrics: ScrollViewportMetrics): NavigatorViewport {
  const scrollWidth = Math.max(1, metrics.scrollWidth)
  const scrollHeight = Math.max(1, metrics.scrollHeight)
  return {
    x: clamp(metrics.scrollLeft / scrollWidth),
    y: clamp(metrics.scrollTop / scrollHeight),
    width: clamp(metrics.clientWidth / scrollWidth),
    height: clamp(metrics.clientHeight / scrollHeight),
  }
}

export function navigatorPointToScroll(point: { x: number; y: number }, metrics: ScrollViewportMetrics) {
  return {
    left: clamp(point.x * metrics.scrollWidth - metrics.clientWidth / 2, 0, Math.max(0, metrics.scrollWidth - metrics.clientWidth)),
    top: clamp(point.y * metrics.scrollHeight - metrics.clientHeight / 2, 0, Math.max(0, metrics.scrollHeight - metrics.clientHeight)),
  }
}
