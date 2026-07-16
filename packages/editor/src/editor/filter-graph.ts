import type { FilterGraphKind, FilterGraphNode } from './types'

export const filterGraphKinds: Array<{ kind: FilterGraphKind; label: string; family: string }> = [
  { kind: 'gaussian-blur', label: 'Gaussian Blur', family: 'Blur' },
  { kind: 'sharpen', label: 'Smart Sharpen', family: 'Sharpen' },
  { kind: 'noise', label: 'Add Noise', family: 'Noise' },
  { kind: 'wave', label: 'Wave', family: 'Distort' },
  { kind: 'emboss', label: 'Emboss', family: 'Stylize' },
  { kind: 'clouds', label: 'Clouds', family: 'Render' },
  { kind: 'pixelate', label: 'Mosaic', family: 'Pixelate' },
]

export function createFilterGraphNode(kind: FilterGraphKind, id: string = globalThis.crypto?.randomUUID?.() ?? `filter-${Date.now()}`): FilterGraphNode {
  return { id, kind, enabled: true, amount: kind === 'noise' || kind === 'clouds' ? 20 : kind === 'sharpen' || kind === 'emboss' ? 50 : 25, size: kind === 'pixelate' ? 12 : kind === 'gaussian-blur' ? 8 : kind === 'wave' ? 32 : 4, seed: Math.floor(Math.random() * 65536) }
}

export function normalizeFilterGraph(nodes: FilterGraphNode[] | undefined) {
  return (nodes ?? []).map((node) => ({ ...node, enabled: node.enabled !== false, amount: Math.max(0, Math.min(100, Number(node.amount) || 0)), size: Math.max(1, Math.min(256, Number(node.size) || 1)), seed: Math.round(Number(node.seed) || 0) }))
}

function sample(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, channel: number) {
  const sx = Math.max(0, Math.min(width - 1, Math.round(x)))
  const sy = Math.max(0, Math.min(height - 1, Math.round(y)))
  return data[(sy * width + sx) * 4 + channel]
}

function noiseAt(x: number, y: number, seed: number) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 0.013) * 43758.5453
  return value - Math.floor(value)
}

export function applyPixelFilterGraph(image: ImageData, nodes: FilterGraphNode[]) {
  const { width, height } = image
  let current = new Uint8ClampedArray(image.data)
  for (const node of normalizeFilterGraph(nodes).filter((candidate) => candidate.enabled && candidate.kind !== 'gaussian-blur')) {
    const next = new Uint8ClampedArray(current)
    const amount = node.amount / 100
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      let sx = x
      let sy = y
      if (node.kind === 'pixelate') { sx = Math.floor(x / node.size) * node.size + node.size / 2; sy = Math.floor(y / node.size) * node.size + node.size / 2 }
      if (node.kind === 'wave') sx += Math.sin(y / Math.max(1, node.size) * Math.PI * 2) * node.amount / 5
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        const base = sample(current, width, height, sx, sy, channel)
        let value = base
        if (node.kind === 'sharpen') value = base * (1 + amount * 4) - (sample(current, width, height, x - 1, y, channel) + sample(current, width, height, x + 1, y, channel) + sample(current, width, height, x, y - 1, channel) + sample(current, width, height, x, y + 1, channel)) * amount
        else if (node.kind === 'noise') value = base + (noiseAt(x, y, node.seed) - 0.5) * 255 * amount
        else if (node.kind === 'emboss') value = 128 + (base - sample(current, width, height, x - node.size, y - node.size, channel)) * (0.5 + amount)
        else if (node.kind === 'clouds') value = base * (1 - amount) + noiseAt(x / node.size, y / node.size, node.seed) * 255 * amount
        next[offset + channel] = Math.max(0, Math.min(255, Math.round(value)))
      }
      next[offset + 3] = sample(current, width, height, sx, sy, 3)
    }
    current = next
  }
  return new ImageData(current, width, height)
}
