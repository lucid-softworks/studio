import type { AdjustmentCurve } from './types'

export type CurvePreset = 'linear' | 'medium-contrast' | 'strong-contrast' | 'negative'

export function curvePreset(preset: CurvePreset): AdjustmentCurve {
  if (preset === 'medium-contrast') return [{ input: 0, output: 0 }, { input: 64, output: 52 }, { input: 128, output: 128 }, { input: 192, output: 204 }, { input: 255, output: 255 }]
  if (preset === 'strong-contrast') return [{ input: 0, output: 0 }, { input: 64, output: 38 }, { input: 128, output: 128 }, { input: 192, output: 220 }, { input: 255, output: 255 }]
  if (preset === 'negative') return [{ input: 0, output: 255 }, { input: 255, output: 0 }]
  return [{ input: 0, output: 0 }, { input: 255, output: 255 }]
}

export function visibleHistogram(data: Uint8ClampedArray, channel: 'rgb' | 'red' | 'green' | 'blue') {
  const bins = Array.from({ length: 256 }, () => 0)
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue
    const value = channel === 'red' ? data[offset] : channel === 'green' ? data[offset + 1] : channel === 'blue' ? data[offset + 2] : Math.round(data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114)
    bins[value] += 1
  }
  return bins
}

export function histogramRange(bins: number[]) {
  const black = bins.findIndex((count) => count > 0)
  const whiteFromEnd = [...bins].reverse().findIndex((count) => count > 0)
  const white = whiteFromEnd < 0 ? 255 : 255 - whiteFromEnd
  const total = bins.reduce((sum, count) => sum + count, 0)
  let cumulative = 0
  let median = 128
  for (let index = 0; index < bins.length; index += 1) {
    cumulative += bins[index]
    if (cumulative >= total / 2) { median = index; break }
  }
  return { black: black < 0 ? 0 : black, median, white }
}
