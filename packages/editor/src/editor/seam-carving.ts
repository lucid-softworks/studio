function energy(data: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const pixel = (px: number, py: number, channel: number) => data[(Math.max(0, Math.min(height - 1, py)) * width + Math.max(0, Math.min(width - 1, px))) * 4 + channel]
  let value = 0
  for (let channel = 0; channel < 3; channel += 1) value += Math.abs(pixel(x + 1, y, channel) - pixel(x - 1, y, channel)) + Math.abs(pixel(x, y + 1, channel) - pixel(x, y - 1, channel))
  return value
}

function verticalSeam(data: Uint8ClampedArray, width: number, height: number) {
  const costs = new Float64Array(width * height)
  const parents = new Int32Array(width * height)
  for (let x = 0; x < width; x += 1) costs[x] = energy(data, width, height, x, 0)
  for (let y = 1; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let parent = x
    let best = costs[(y - 1) * width + x]
    if (x > 0 && costs[(y - 1) * width + x - 1] < best) { best = costs[(y - 1) * width + x - 1]; parent = x - 1 }
    if (x + 1 < width && costs[(y - 1) * width + x + 1] < best) { best = costs[(y - 1) * width + x + 1]; parent = x + 1 }
    costs[y * width + x] = energy(data, width, height, x, y) + best
    parents[y * width + x] = parent
  }
  let x = 0
  for (let candidate = 1; candidate < width; candidate += 1) if (costs[(height - 1) * width + candidate] < costs[(height - 1) * width + x]) x = candidate
  const seam = new Int32Array(height)
  for (let y = height - 1; y >= 0; y -= 1) { seam[y] = x; x = parents[y * width + x] }
  return seam
}

function changeWidth(image: ImageData, enlarge: boolean) {
  const seam = verticalSeam(image.data, image.width, image.height)
  const width = image.width + (enlarge ? 1 : -1)
  const output = new ImageData(width, image.height)
  for (let y = 0; y < image.height; y += 1) {
    const seamX = seam[y]
    let targetX = 0
    for (let x = 0; x < image.width; x += 1) {
      if (!enlarge && x === seamX) continue
      const sourceOffset = (y * image.width + x) * 4
      const targetOffset = (y * width + targetX) * 4
      output.data.set(image.data.subarray(sourceOffset, sourceOffset + 4), targetOffset)
      targetX += 1
      if (enlarge && x === seamX) {
        const neighbour = Math.min(image.width - 1, x + 1)
        for (let channel = 0; channel < 4; channel += 1) output.data[(y * width + targetX) * 4 + channel] = Math.round((image.data[sourceOffset + channel] + image.data[(y * image.width + neighbour) * 4 + channel]) / 2)
        targetX += 1
      }
    }
  }
  return output
}

function transpose(image: ImageData) {
  const output = new ImageData(image.height, image.width)
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    const source = (y * image.width + x) * 4
    const target = (x * output.width + y) * 4
    output.data.set(image.data.subarray(source, source + 4), target)
  }
  return output
}

export function contentAwareResize(source: ImageData, targetWidth: number, targetHeight: number) {
  targetWidth = Math.max(2, Math.round(targetWidth))
  targetHeight = Math.max(2, Math.round(targetHeight))
  let output = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height)
  while (output.width !== targetWidth) output = changeWidth(output, output.width < targetWidth)
  if (output.height !== targetHeight) {
    output = transpose(output)
    while (output.width !== targetHeight) output = changeWidth(output, output.width < targetHeight)
    output = transpose(output)
  }
  return output
}
