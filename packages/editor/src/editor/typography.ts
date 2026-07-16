export type TextLineRange = { start: number; end: number }
import type { Position, VectorPath } from './types'

/**
 * Greedy paragraph wrapping with word-boundary preference. Newlines are hard
 * breaks and overlong words fall back to character wrapping.
 */
export function wrapTextRanges(text: string, maximumWidth: number, measure: (start: number, end: number) => number): TextLineRange[] {
  if (maximumWidth <= 0) return [{ start: 0, end: text.length }]
  const lines: TextLineRange[] = []
  let paragraphStart = 0
  while (paragraphStart <= text.length) {
    const newline = text.indexOf('\n', paragraphStart)
    const paragraphEnd = newline < 0 ? text.length : newline
    if (paragraphStart === paragraphEnd) lines.push({ start: paragraphStart, end: paragraphEnd })
    else {
      let lineStart = paragraphStart
      while (lineStart < paragraphEnd) {
        let candidateEnd = lineStart + 1
        let lastBreak = -1
        while (candidateEnd <= paragraphEnd && measure(lineStart, candidateEnd) <= maximumWidth) {
          if (/\s/.test(text[candidateEnd - 1])) lastBreak = candidateEnd
          candidateEnd += 1
        }
        if (candidateEnd > paragraphEnd + 1) candidateEnd = paragraphEnd + 1
        let lineEnd = candidateEnd - 1
        if (lineEnd < paragraphEnd && lastBreak > lineStart) lineEnd = lastBreak
        if (lineEnd <= lineStart) lineEnd = Math.min(paragraphEnd, lineStart + 1)
        let visibleEnd = lineEnd
        while (visibleEnd > lineStart && /\s/.test(text[visibleEnd - 1])) visibleEnd -= 1
        lines.push({ start: lineStart, end: visibleEnd })
        lineStart = lineEnd
        while (lineStart < paragraphEnd && /\s/.test(text[lineStart])) lineStart += 1
      }
    }
    if (newline < 0) break
    paragraphStart = newline + 1
  }
  return lines.length ? lines : [{ start: 0, end: 0 }]
}

function cubic(start: Position, controlA: Position, controlB: Position, end: Position, t: number) {
  const inverse = 1 - t
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * controlA.x + 3 * inverse * t ** 2 * controlB.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * controlA.y + 3 * inverse * t ** 2 * controlB.y + t ** 3 * end.y,
  }
}

export function flattenTextPath(path: VectorPath, width: number, height: number, segmentSteps = 18) {
  const points: Position[] = []
  const knots = path.knots
  const segmentCount = path.closed ? knots.length : Math.max(0, knots.length - 1)
  for (let segment = 0; segment < segmentCount; segment += 1) {
    const start = knots[segment]
    const end = knots[(segment + 1) % knots.length]
    for (let step = segment === 0 ? 0 : 1; step <= segmentSteps; step += 1) {
      const point = cubic(start.anchor, start.out, end.in, end.anchor, step / segmentSteps)
      points.push({ x: point.x * width, y: point.y * height })
    }
  }
  return points
}

export function samplePolyline(points: Position[], distance: number) {
  if (points.length < 2) return null
  let remaining = distance
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]
    const end = points[index]
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    if (remaining <= length) {
      const t = length ? remaining / length : 0
      return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, angle: Math.atan2(end.y - start.y, end.x - start.x) }
    }
    remaining -= length
  }
  const start = points.at(-2)!
  const end = points.at(-1)!
  return { x: end.x, y: end.y, angle: Math.atan2(end.y - start.y, end.x - start.x) }
}

export function polylineLength(points: Position[]) {
  let length = 0
  for (let index = 1; index < points.length; index += 1) length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y)
  return length
}

export function textWarpOffset(style: string, progress: number, bend: number, perspective: number, height: number) {
  const x = Math.max(0, Math.min(1, progress))
  const amount = bend / 100 * height / 2
  let shaped = Math.sin(x * Math.PI)
  if (style === 'arch') shaped = 1 - Math.abs(x * 2 - 1)
  else if (style === 'bulge') shaped = 1 - (x * 2 - 1) ** 2
  else if (style === 'wave') shaped = Math.sin(x * Math.PI * 2)
  else if (style === 'flag') shaped = Math.sin(x * Math.PI * 2) * (0.65 + x * 0.35)
  return -shaped * amount + (x - 0.5) * perspective / 100 * height
}
