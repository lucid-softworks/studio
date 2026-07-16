export type PatchMatchInput = { data: Uint8ClampedArray; mask: Uint8Array; width: number; height: number; iterations?: number }
export type PatchMatchRegion = { x: number; y: number; width: number; height: number }

export function extractRgbaRegion(data: Uint8ClampedArray, sourceWidth: number, sourceHeight: number, region: PatchMatchRegion) {
  if (data.length !== sourceWidth * sourceHeight * 4) throw new Error('RGBA source dimensions do not match.')
  if (region.x < 0 || region.y < 0 || region.width < 1 || region.height < 1 || region.x + region.width > sourceWidth || region.y + region.height > sourceHeight) throw new Error('RGBA result region is outside the source.')
  const result = new Uint8ClampedArray(region.width * region.height * 4)
  for (let row = 0; row < region.height; row += 1) {
    const sourceStart = ((region.y + row) * sourceWidth + region.x) * 4
    result.set(data.subarray(sourceStart, sourceStart + region.width * 4), row * region.width * 4)
  }
  return result
}

function patchScore(data: Uint8ClampedArray, mask: Uint8Array, width: number, height: number, target: number, source: number) {
  const tx = target % width
  const ty = Math.floor(target / width)
  const sx = source % width
  const sy = Math.floor(source / width)
  let score = 0
  let samples = 0
  for (let row = -2; row <= 2; row += 1) for (let column = -2; column <= 2; column += 1) {
    const targetX = tx + column
    const targetY = ty + row
    const sourceX = sx + column
    const sourceY = sy + row
    if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height || sourceX < 0 || sourceY < 0 || sourceX >= width || sourceY >= height) continue
    const targetPixel = targetY * width + targetX
    const sourcePixel = sourceY * width + sourceX
    if (mask[targetPixel] || mask[sourcePixel]) continue
    const targetOffset = targetPixel * 4
    const sourceOffset = sourcePixel * 4
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = data[targetOffset + channel] - data[sourceOffset + channel]
      score += difference * difference
    }
    samples += 1
  }
  return samples ? score / samples : Number.POSITIVE_INFINITY
}

/** Deterministic local PatchMatch fill. It runs entirely in the browser worker. */
export function patchMatchFill({ data, mask, width, height, iterations = 5 }: PatchMatchInput) {
  if (mask.length !== width * height || data.length !== width * height * 4) throw new Error('PatchMatch dimensions do not match.')
  const holes: number[] = []
  const known: number[] = []
  for (let pixel = 0; pixel < mask.length; pixel += 1) (mask[pixel] ? holes : known).push(pixel)
  if (!holes.length) return new Uint8ClampedArray(data)
  if (!known.length) throw new Error('Content-aware fill needs some pixels outside the selection.')
  if (holes.length > 750_000) throw new Error('The selected content-aware fill area is too large. Select less than 750,000 pixels.')
  let seed = (width * 73856093 ^ height * 19349663 ^ holes.length * 83492791) >>> 0
  const randomKnown = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return known[seed % known.length]
  }
  const sourceFor = new Int32Array(mask.length)
  const scores = new Float64Array(mask.length)
  scores.fill(Number.POSITIVE_INFINITY)
  for (const target of holes) {
    const source = randomKnown()
    sourceFor[target] = source
    scores[target] = patchScore(data, mask, width, height, target, source)
  }
  const tryCandidate = (target: number, candidate: number) => {
    if (candidate < 0 || candidate >= mask.length || mask[candidate]) return
    const score = patchScore(data, mask, width, height, target, candidate)
    if (score < scores[target]) { scores[target] = score; sourceFor[target] = candidate }
  }
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const ordered = iteration % 2 ? holes.toReversed() : holes
    for (const target of ordered) {
      const x = target % width
      const neighbours = iteration % 2 ? [target + 1, target + width] : [target - 1, target - width]
      for (const neighbour of neighbours) {
        if (neighbour < 0 || neighbour >= mask.length || !mask[neighbour]) continue
        const neighbourX = neighbour % width
        if (Math.abs(neighbourX - x) > 1) continue
        tryCandidate(target, sourceFor[neighbour] + (target - neighbour))
      }
      let radius = Math.max(width, height)
      const source = sourceFor[target]
      const sourceX = source % width
      const sourceY = Math.floor(source / width)
      while (radius >= 1) {
        const candidateX = Math.max(0, Math.min(width - 1, sourceX + Math.floor((randomKnown() / mask.length * 2 - 1) * radius)))
        const candidateY = Math.max(0, Math.min(height - 1, sourceY + Math.floor((randomKnown() / mask.length * 2 - 1) * radius)))
        tryCandidate(target, candidateY * width + candidateX)
        radius = Math.floor(radius / 2)
      }
    }
  }
  const output = new Uint8ClampedArray(data)
  for (const target of holes) output.set(data.subarray(sourceFor[target] * 4, sourceFor[target] * 4 + 4), target * 4)
  return output
}
