export type HistogramChannel = 'red' | 'green' | 'blue' | 'luminance'

export type HistogramResult = {
  bins: Record<HistogramChannel, number[]>
  mean: Record<HistogramChannel, number>
  median: Record<HistogramChannel, number>
  pixels: number
  waveform?: number[]
  vectorscope?: number[]
  scopeSize?: number
  exact?: boolean
  precision?: 8 | 16 | 32
}

const channels: HistogramChannel[] = ['red', 'green', 'blue', 'luminance']

export type ColorAnalysisAccumulator = {
  bins: Record<HistogramChannel, number[]>
  waveform: number[]
  vectorscope: number[]
  pixels: number
  scopeSize: number
}

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

export function calculateColorAnalysis(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  scopeSize = 128,
): HistogramResult {
  void height
  const accumulator = createColorAnalysisAccumulator(scopeSize)
  accumulateColorAnalysisTile(accumulator, data, width, 0, width)
  return finishColorAnalysis(accumulator)
}

export function createColorAnalysisAccumulator(scopeSize = 128): ColorAnalysisAccumulator {
  return {
    bins: Object.fromEntries(channels.map((channel) => [channel, Array.from<number>({ length: 256 }).fill(0)])) as Record<HistogramChannel, number[]>,
    waveform: Array.from<number>({ length: scopeSize * scopeSize }).fill(0),
    vectorscope: Array.from<number>({ length: scopeSize * scopeSize }).fill(0),
    pixels: 0,
    scopeSize,
  }
}

export function accumulateColorAnalysisTile(
  accumulator: ColorAnalysisAccumulator,
  data: Uint8ClampedArray,
  tileWidth: number,
  originX: number,
  frameWidth: number,
) {
  const { bins, waveform, vectorscope, scopeSize } = accumulator
  const safeTileWidth = Math.max(1, tileWidth)
  const safeFrameWidth = Math.max(1, frameWidth)
  for (let offset = 0, pixel = 0; offset + 3 < data.length; offset += 4, pixel += 1) {
    if (data[offset + 3] === 0) continue
    const red = data[offset]
    const green = data[offset + 1]
    const blue = data[offset + 2]
    const luminance = Math.max(0, Math.min(255, Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722)))
    bins.red[red] += 1
    bins.green[green] += 1
    bins.blue[blue] += 1
    bins.luminance[luminance] += 1
    accumulator.pixels += 1
    const x = originX + pixel % safeTileWidth
    const waveX = Math.min(scopeSize - 1, Math.floor(x / safeFrameWidth * scopeSize))
    const waveY = scopeSize - 1 - Math.min(scopeSize - 1, Math.floor(luminance / 256 * scopeSize))
    waveform[waveY * scopeSize + waveX] += 1

    const chromaU = Math.max(0, Math.min(255, Math.round(-0.168736 * red - 0.331264 * green + 0.5 * blue + 128)))
    const chromaV = Math.max(0, Math.min(255, Math.round(0.5 * red - 0.418688 * green - 0.081312 * blue + 128)))
    const vectorX = Math.min(scopeSize - 1, Math.floor(chromaU / 256 * scopeSize))
    const vectorY = scopeSize - 1 - Math.min(scopeSize - 1, Math.floor(chromaV / 256 * scopeSize))
    vectorscope[vectorY * scopeSize + vectorX] += 1
  }
}

export function finishColorAnalysis(accumulator: ColorAnalysisAccumulator): HistogramResult {
  const { bins, pixels, waveform, vectorscope, scopeSize } = accumulator
  const mean = Object.fromEntries(channels.map((channel) => {
    const sum = bins[channel].reduce((total, count, value) => total + count * value, 0)
    return [channel, pixels ? sum / pixels : 0]
  })) as Record<HistogramChannel, number>
  const median = Object.fromEntries(channels.map((channel) => [channel, medianBin(bins[channel], pixels)])) as Record<HistogramChannel, number>
  return { bins, mean, median, pixels, waveform, vectorscope, scopeSize }
}

export function calculatePrecisionColorAnalysis(
  data: Uint16Array | Float32Array,
  bitDepth: 16 | 32,
  width: number,
  height: number,
  scopeSize = 128,
) {
  void height
  const display = new Uint8ClampedArray(width * height * 4)
  const maximum = bitDepth === 16 ? 65535 : 1
  for (let index = 0; index < display.length; index += 1) {
    display[index] = Math.round(Math.max(0, Math.min(1, data[index] / maximum)) * 255)
  }
  return { ...calculateColorAnalysis(display, width, height, scopeSize), exact: true, precision: bitDepth }
}
