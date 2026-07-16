import { d, std, type TgpuRoot } from 'typegpu'
import type { HistogramResult } from '../histogram'

const HISTOGRAM_VALUES = 4 * 256

function statistics(bins: number[], pixels: number) {
  let sum = 0
  let accumulated = 0
  let median = 0
  const midpoint = Math.max(1, Math.ceil(pixels / 2))
  for (let index = 0; index < bins.length; index += 1) {
    sum += bins[index] * index
    accumulated += bins[index]
    if (!median && accumulated >= midpoint) median = index
  }
  return { mean: pixels ? sum / pixels : 0, median }
}

/** Reduces an exact rendered frame with TypeGPU atomics; callers retain a Worker fallback. */
export async function reduceColorAnalysisTypeGpu(
  root: TgpuRoot,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  scopeSize = 128,
): Promise<HistogramResult> {
  const pixelCount = width * height
  const inputSchema = d.arrayOf(d.u32, pixels.length)
  const outputLength = HISTOGRAM_VALUES + scopeSize * scopeSize * 2
  const outputSchema = d.arrayOf(d.atomic(d.u32), outputLength)
  const input = root.createBuffer(inputSchema, Array.from(pixels)).$usage('storage')
  const output = root.createBuffer(outputSchema, Array.from<number>({ length: outputLength }).fill(0)).$usage('storage')
  const source = input.as('readonly')
  const reduction = output.as('mutable')

  const pipeline = root.createGuardedComputePipeline((index) => {
    'use gpu'
    const offset = index * 4
    const alpha = source.$[offset + 3]
    if (alpha === 0) return
    const red = source.$[offset]
    const green = source.$[offset + 1]
    const blue = source.$[offset + 2]
    const luminance = d.u32(std.clamp(std.round(red * 0.2126 + green * 0.7152 + blue * 0.0722), 0, 255))
    std.atomicAdd(reduction.$[red], 1)
    std.atomicAdd(reduction.$[256 + green], 1)
    std.atomicAdd(reduction.$[512 + blue], 1)
    std.atomicAdd(reduction.$[768 + luminance], 1)

    const x = index % width
    const waveX = d.u32(std.min(scopeSize - 1, std.floor(x / width * scopeSize)))
    const waveY = d.u32(scopeSize - 1 - std.min(scopeSize - 1, std.floor(luminance / 256 * scopeSize)))
    std.atomicAdd(reduction.$[HISTOGRAM_VALUES + waveY * scopeSize + waveX], 1)

    const chromaU = d.u32(std.clamp(std.round(-0.168736 * red - 0.331264 * green + 0.5 * blue + 128), 0, 255))
    const chromaV = d.u32(std.clamp(std.round(0.5 * red - 0.418688 * green - 0.081312 * blue + 128), 0, 255))
    const vectorX = d.u32(std.min(scopeSize - 1, std.floor(chromaU / 256 * scopeSize)))
    const vectorY = d.u32(scopeSize - 1 - std.min(scopeSize - 1, std.floor(chromaV / 256 * scopeSize)))
    std.atomicAdd(reduction.$[HISTOGRAM_VALUES + scopeSize * scopeSize + vectorY * scopeSize + vectorX], 1)
  })

  pipeline.dispatchThreads(pixelCount)
  const values = await output.read() as number[]
  input.destroy()
  output.destroy()
  const bins = {
    red: values.slice(0, 256),
    green: values.slice(256, 512),
    blue: values.slice(512, 768),
    luminance: values.slice(768, 1024),
  }
  const pixelsReduced = bins.luminance.reduce((sum, value) => sum + value, 0)
  const red = statistics(bins.red, pixelsReduced)
  const green = statistics(bins.green, pixelsReduced)
  const blue = statistics(bins.blue, pixelsReduced)
  const luminance = statistics(bins.luminance, pixelsReduced)
  return {
    bins,
    pixels: pixelsReduced,
    mean: { red: red.mean, green: green.mean, blue: blue.mean, luminance: luminance.mean },
    median: { red: red.median, green: green.median, blue: blue.median, luminance: luminance.median },
    waveform: values.slice(HISTOGRAM_VALUES, HISTOGRAM_VALUES + scopeSize * scopeSize),
    vectorscope: values.slice(HISTOGRAM_VALUES + scopeSize * scopeSize),
    scopeSize,
    exact: true,
    precision: 8,
  }
}
