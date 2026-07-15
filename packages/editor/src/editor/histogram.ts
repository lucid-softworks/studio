export type HistogramChannel = 'red' | 'green' | 'blue' | 'luminance'

export type HistogramResult = {
  bins: Record<HistogramChannel, number[]>
  mean: Record<HistogramChannel, number>
  median: Record<HistogramChannel, number>
  pixels: number
}

const channels: HistogramChannel[] = ['red', 'green', 'blue', 'luminance']

function medianBin(bins: number[], pixels: number) {
  const midpoint = Math.max(1, Math.ceil(pixels / 2))
  let total = 0
  for (let index = 0; index < bins.length; index += 1) {
    total += bins[index]
    if (total >= midpoint) return index
  }
  return 0
}

export function calculateHistogram(data: Uint8ClampedArray): HistogramResult {
  const bins = Object.fromEntries(channels.map((channel) => [channel, Array.from<number>({ length: 256 }).fill(0)])) as Record<HistogramChannel, number[]>
  const sums: Record<HistogramChannel, number> = { red: 0, green: 0, blue: 0, luminance: 0 }
  let pixels = 0
  for (let offset = 0; offset + 3 < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue
    const red = data[offset]
    const green = data[offset + 1]
    const blue = data[offset + 2]
    const luminance = Math.max(0, Math.min(255, Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722)))
    bins.red[red] += 1
    bins.green[green] += 1
    bins.blue[blue] += 1
    bins.luminance[luminance] += 1
    sums.red += red
    sums.green += green
    sums.blue += blue
    sums.luminance += luminance
    pixels += 1
  }
  return {
    bins,
    mean: Object.fromEntries(channels.map((channel) => [channel, pixels ? sums[channel] / pixels : 0])) as Record<HistogramChannel, number>,
    median: Object.fromEntries(channels.map((channel) => [channel, medianBin(bins[channel], pixels)])) as Record<HistogramChannel, number>,
    pixels,
  }
}
