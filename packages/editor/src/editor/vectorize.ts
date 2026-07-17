import type { Position, VectorPath } from './types'

export type VectorizeOptions = {
  mode: 'monochrome' | 'color'
  threshold: number
  colorCount: number
  smoothing: number
  cornerThreshold: number
  noise: number
  monochromeColor: string
}

export type VectorizedShape = { color: string; paths: VectorPath[] }

type Point = { x: number; y: number }
type Edge = { start: number; end: number; point: Point; endPoint: Point }

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
const colorHex = (color: readonly number[]) => `#${color.map((channel) => clampByte(channel).toString(16).padStart(2, '0')).join('')}`

function removeCollinear(points: Point[]) {
  if (points.length < 4) return points
  return points.filter((point, index) => {
    const previous = points[(index + points.length - 1) % points.length]
    const next = points[(index + 1) % points.length]
    return (point.x - previous.x) * (next.y - point.y) !== (point.y - previous.y) * (next.x - point.x)
  })
}

function signedArea(points: readonly Point[]) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const next = points[(index + 1) % points.length]
    area += point.x * next.y - next.x * point.y
  }
  return area / 2
}

function vectorPath(points: Point[], width: number, height: number, operation: VectorPath['operation'], options: VectorizeOptions): VectorPath {
  const normalized = points.map((point): Position => ({ x: point.x / width, y: point.y / height }))
  const smooth = Math.max(0, Math.min(100, options.smoothing)) / 100 * 0.14
  return {
    closed: true,
    operation,
    fillRule: 'non-zero',
    knots: normalized.map((anchor, index) => {
      const previous = normalized[(index + normalized.length - 1) % normalized.length]
      const next = normalized[(index + 1) % normalized.length]
      const incoming = { x: anchor.x - previous.x, y: anchor.y - previous.y }
      const outgoing = { x: next.x - anchor.x, y: next.y - anchor.y }
      const lengths = Math.hypot(incoming.x, incoming.y) * Math.hypot(outgoing.x, outgoing.y)
      const cosine = lengths ? (incoming.x * outgoing.x + incoming.y * outgoing.y) / lengths : 1
      const sharpness = (1 - Math.max(-1, Math.min(1, cosine))) * 50
      const corner = sharpness >= Math.max(0, Math.min(100, options.cornerThreshold))
      const control = corner ? { x: 0, y: 0 } : { x: (next.x - previous.x) * smooth, y: (next.y - previous.y) * smooth }
      return { linked: !corner, in: { x: anchor.x - control.x, y: anchor.y - control.y }, anchor, out: { x: anchor.x + control.x, y: anchor.y + control.y } }
    }),
  }
}

function traceMask(mask: Uint8Array, width: number, height: number, options: VectorizeOptions) {
  const row = width + 1
  const edges: Edge[] = []
  const add = (startX: number, startY: number, endX: number, endY: number) => edges.push({ start: startY * row + startX, end: endY * row + endX, point: { x: startX, y: startY }, endPoint: { x: endX, y: endY } })
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!filled(x, y)) continue
    if (!filled(x, y - 1)) add(x, y, x + 1, y)
    if (!filled(x + 1, y)) add(x + 1, y, x + 1, y + 1)
    if (!filled(x, y + 1)) add(x + 1, y + 1, x, y + 1)
    if (!filled(x - 1, y)) add(x, y + 1, x, y)
  }
  const outgoing = new Map<number, number[]>()
  edges.forEach((edge, index) => {
    const candidates = outgoing.get(edge.start)
    if (candidates) candidates.push(index)
    else outgoing.set(edge.start, [index])
  })
  const used = new Uint8Array(edges.length)
  const loops: Array<{ points: Point[]; area: number }> = []
  const minimumArea = 1 + (Math.max(0, Math.min(100, options.noise)) / 100) ** 2 * width * height * 0.01
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
    if (used[edgeIndex]) continue
    const first = edges[edgeIndex]
    const points: Point[] = []
    let current = edgeIndex
    let guard = 0
    while (!used[current] && guard++ <= edges.length) {
      const edge = edges[current]
      used[current] = 1
      points.push(edge.point)
      if (edge.end === first.start) break
      const candidate = outgoing.get(edge.end)?.find((index) => !used[index])
      if (candidate === undefined) { points.push(edge.endPoint); break }
      current = candidate
    }
    const simplified = removeCollinear(points)
    const area = signedArea(simplified)
    if (simplified.length >= 3 && Math.abs(area) >= minimumArea) loops.push({ points: simplified, area })
  }
  loops.sort((left, right) => Math.abs(right.area) - Math.abs(left.area))
  return loops.map((loop) => vectorPath(loop.points, width, height, loop.area >= 0 ? 'combine' : 'subtract', options))
}

function colorPalette(data: Uint8ClampedArray, count: number) {
  const samples: number[][] = []
  const stride = Math.max(1, Math.ceil(data.length / 4 / 12_000))
  for (let pixel = 0; pixel < data.length / 4; pixel += stride) {
    const offset = pixel * 4
    if (data[offset + 3] >= 32) samples.push([data[offset], data[offset + 1], data[offset + 2]])
  }
  if (!samples.length) return []
  const size = Math.max(2, Math.min(16, Math.round(count)))
  const palette = Array.from({ length: Math.min(size, samples.length) }, (_, index) => [...samples[Math.floor(index * samples.length / size)]])
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const sums = palette.map(() => [0, 0, 0, 0])
    for (const sample of samples) {
      const nearest = nearestColor(sample, palette)
      sums[nearest][0] += sample[0]; sums[nearest][1] += sample[1]; sums[nearest][2] += sample[2]; sums[nearest][3] += 1
    }
    sums.forEach((sum, index) => { if (sum[3]) palette[index] = [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]] })
  }
  return palette
}

function nearestColor(color: readonly number[], palette: readonly number[][]) {
  let nearest = 0
  let distance = Number.POSITIVE_INFINITY
  for (let index = 0; index < palette.length; index += 1) {
    const candidate = palette[index]
    const next = (color[0] - candidate[0]) ** 2 + (color[1] - candidate[1]) ** 2 + (color[2] - candidate[2]) ** 2
    if (next < distance) { nearest = index; distance = next }
  }
  return nearest
}

export function vectorizeImageData(image: ImageData, options: VectorizeOptions): VectorizedShape[] {
  if (options.mode === 'monochrome') {
    const mask = new Uint8Array(image.width * image.height)
    for (let pixel = 0; pixel < mask.length; pixel += 1) {
      const offset = pixel * 4
      const luminance = image.data[offset] * 0.2126 + image.data[offset + 1] * 0.7152 + image.data[offset + 2] * 0.0722
      mask[pixel] = image.data[offset + 3] >= 32 && luminance <= options.threshold ? 1 : 0
    }
    const paths = traceMask(mask, image.width, image.height, options)
    return paths.length ? [{ color: options.monochromeColor, paths }] : []
  }
  const palette = colorPalette(image.data, options.colorCount)
  return palette.flatMap((color, colorIndex) => {
    const mask = new Uint8Array(image.width * image.height)
    for (let pixel = 0; pixel < mask.length; pixel += 1) {
      const offset = pixel * 4
      if (image.data[offset + 3] >= 32) mask[pixel] = nearestColor([image.data[offset], image.data[offset + 1], image.data[offset + 2]], palette) === colorIndex ? 1 : 0
    }
    const paths = traceMask(mask, image.width, image.height, options)
    return paths.length ? [{ color: colorHex(color), paths }] : []
  })
}
