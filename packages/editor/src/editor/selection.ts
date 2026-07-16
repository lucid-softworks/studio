export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect'
export type SelectionShape = { kind: 'rectangle' | 'ellipse'; x: number; y: number; width: number; height: number }
export type SelectionBounds = { x: number; y: number; width: number; height: number }
export const SELECTION_TILE_SIZE = 256
export type SelectionTile = { x: number; y: number; width: number; height: number; alpha: Uint8ClampedArray }
export type SelectionState = { mask: HTMLCanvasElement; tiles: Map<string, SelectionTile>; bounds: SelectionBounds | null; revision: number }

function createMask(width: number, height: number) {
  const mask = document.createElement('canvas')
  mask.width = width
  mask.height = height
  return mask
}

export function createSelection(width: number, height: number): SelectionState {
  return { mask: createMask(width, height), tiles: new Map(), bounds: null, revision: 0 }
}

function tileKey(x: number, y: number) {
  return `${x}:${y}`
}

export function selectionTiles(mask: HTMLCanvasElement) {
  const context = mask.getContext('2d', { willReadFrequently: true })
  const tiles = new Map<string, SelectionTile>()
  if (!context) return tiles
  for (let y = 0; y < mask.height; y += SELECTION_TILE_SIZE) {
    for (let x = 0; x < mask.width; x += SELECTION_TILE_SIZE) {
      const width = Math.min(SELECTION_TILE_SIZE, mask.width - x)
      const height = Math.min(SELECTION_TILE_SIZE, mask.height - y)
      const pixels = context.getImageData(x, y, width, height).data
      const alpha = new Uint8ClampedArray(width * height)
      let populated = false
      for (let pixel = 0; pixel < alpha.length; pixel += 1) {
        alpha[pixel] = pixels[pixel * 4 + 3]
        populated ||= alpha[pixel] > 0
      }
      if (populated) tiles.set(tileKey(Math.floor(x / SELECTION_TILE_SIZE), Math.floor(y / SELECTION_TILE_SIZE)), { x, y, width, height, alpha })
    }
  }
  return tiles
}

export function tiledSelectionBounds(tiles: ReadonlyMap<string, SelectionTile>): SelectionBounds | null {
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = -1
  let bottom = -1
  for (const tile of tiles.values()) {
    for (let y = 0; y < tile.height; y += 1) {
      for (let x = 0; x < tile.width; x += 1) {
        if (!tile.alpha[y * tile.width + x]) continue
        left = Math.min(left, tile.x + x)
        top = Math.min(top, tile.y + y)
        right = Math.max(right, tile.x + x)
        bottom = Math.max(bottom, tile.y + y)
      }
    }
  }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

function synchronizedSelection(mask: HTMLCanvasElement, revision: number): SelectionState {
  const tiles = selectionTiles(mask)
  return { mask, tiles, bounds: tiledSelectionBounds(tiles), revision }
}

export function selectionFromMask(mask: HTMLCanvasElement, revision = 0) {
  return synchronizedSelection(mask, revision)
}

export function selectionAlphaAtPoint(selection: SelectionState | null, x: number, y: number) {
  if (!selection) return 0
  const pixelX = Math.round(x)
  const pixelY = Math.round(y)
  if (pixelX < 0 || pixelY < 0 || pixelX >= selection.mask.width || pixelY >= selection.mask.height) return 0
  const tile = selection.tiles.get(tileKey(Math.floor(pixelX / SELECTION_TILE_SIZE), Math.floor(pixelY / SELECTION_TILE_SIZE)))
  return tile ? tile.alpha[(pixelY - tile.y) * tile.width + pixelX - tile.x] / 255 : 0
}

export function cloneSelection(selection: SelectionState): SelectionState {
  const mask = createMask(selection.mask.width, selection.mask.height)
  mask.getContext('2d')?.drawImage(selection.mask, 0, 0)
  return synchronizedSelection(mask, selection.revision)
}

export function selectionBounds(mask: HTMLCanvasElement): SelectionBounds | null {
  const context = mask.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  const { data, width, height } = context.getImageData(0, 0, mask.width, mask.height)
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

function drawShape(context: CanvasRenderingContext2D, shape: SelectionShape) {
  context.beginPath()
  if (shape.kind === 'ellipse') context.ellipse(shape.x + shape.width / 2, shape.y + shape.height / 2, Math.abs(shape.width / 2), Math.abs(shape.height / 2), 0, 0, Math.PI * 2)
  else context.rect(shape.x, shape.y, shape.width, shape.height)
  context.fill()
}

function applyTemporaryMask(selection: SelectionState, temporary: HTMLCanvasElement, mode: SelectionMode, width: number, height: number) {
  const context = selection.mask.getContext('2d', { willReadFrequently: true })
  if (!context) return selection
  if (mode === 'replace') {
    context.clearRect(0, 0, width, height)
    context.drawImage(temporary, 0, 0)
  } else {
    context.save()
    context.globalCompositeOperation = mode === 'add' ? 'source-over' : mode === 'subtract' ? 'destination-out' : 'destination-in'
    context.drawImage(temporary, 0, 0)
    context.restore()
  }
  return synchronizedSelection(selection.mask, selection.revision + 1)
}

export function applySelectionShape(current: SelectionState | null, shape: SelectionShape, mode: SelectionMode, width: number, height: number): SelectionState {
  const selection = current?.mask.width === width && current.mask.height === height ? current : createSelection(width, height)
  const temporary = createMask(width, height)
  const temporaryContext = temporary.getContext('2d')
  if (!temporaryContext) return selection
  temporaryContext.fillStyle = '#ffffff'
  drawShape(temporaryContext, shape)

  return applyTemporaryMask(selection, temporary, mode, width, height)
}

export function applySingleMarquee(current: SelectionState | null, kind: 'row' | 'column', position: number, mode: SelectionMode, width: number, height: number) {
  return applySelectionShape(current, kind === 'row'
    ? { kind: 'rectangle', x: 0, y: Math.max(0, Math.min(height - 1, Math.floor(position))), width, height: 1 }
    : { kind: 'rectangle', x: Math.max(0, Math.min(width - 1, Math.floor(position))), y: 0, width: 1, height }, mode, width, height)
}

export function applySelectionPolygon(current: SelectionState | null, points: Array<{ x: number; y: number }>, mode: SelectionMode, width: number, height: number): SelectionState {
  const selection = current?.mask.width === width && current.mask.height === height ? current : createSelection(width, height)
  if (points.length < 3) return selection
  const temporary = createMask(width, height)
  const context = temporary.getContext('2d')
  if (!context) return selection
  context.fillStyle = '#ffffff'
  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  for (const point of points.slice(1)) context.lineTo(point.x, point.y)
  context.closePath()
  context.fill()
  return applyTemporaryMask(selection, temporary, mode, width, height)
}

export function contiguousColorMask(image: ImageData, startX: number, startY: number, tolerance: number) {
  const width = image.width
  const height = image.height
  const x = Math.max(0, Math.min(width - 1, Math.floor(startX)))
  const y = Math.max(0, Math.min(height - 1, Math.floor(startY)))
  const startOffset = (y * width + x) * 4
  const target = [image.data[startOffset], image.data[startOffset + 1], image.data[startOffset + 2], image.data[startOffset + 3]]
  const mask = new Uint8ClampedArray(width * height)
  const visited = new Uint8Array(width * height)
  const stack = [y * width + x]
  const threshold = Math.max(0, Math.min(255, tolerance))

  while (stack.length) {
    const pixel = stack.pop()!
    if (visited[pixel]) continue
    visited[pixel] = 1
    const offset = pixel * 4
    const distance = Math.max(
      Math.abs(image.data[offset] - target[0]),
      Math.abs(image.data[offset + 1] - target[1]),
      Math.abs(image.data[offset + 2] - target[2]),
      Math.abs(image.data[offset + 3] - target[3]),
    )
    if (distance > threshold) continue
    mask[pixel] = 255
    const pixelX = pixel % width
    const pixelY = Math.floor(pixel / width)
    if (pixelX > 0) stack.push(pixel - 1)
    if (pixelX + 1 < width) stack.push(pixel + 1)
    if (pixelY > 0) stack.push(pixel - width)
    if (pixelY + 1 < height) stack.push(pixel + width)
  }
  return mask
}

export function contiguousAlphaMask(image: ImageData, startX: number, startY: number, threshold = 8) {
  const width = image.width
  const height = image.height
  const x = Math.max(0, Math.min(width - 1, Math.floor(startX)))
  const y = Math.max(0, Math.min(height - 1, Math.floor(startY)))
  const mask = new Uint8ClampedArray(width * height)
  if (image.data[(y * width + x) * 4 + 3] <= threshold) return mask
  const visited = new Uint8Array(width * height)
  const stack = [y * width + x]
  while (stack.length) {
    const pixel = stack.pop()!
    if (visited[pixel]) continue
    visited[pixel] = 1
    const alpha = image.data[pixel * 4 + 3]
    if (alpha <= threshold) continue
    mask[pixel] = alpha
    const pixelX = pixel % width
    const pixelY = Math.floor(pixel / width)
    if (pixelX > 0) stack.push(pixel - 1)
    if (pixelX + 1 < width) stack.push(pixel + 1)
    if (pixelY > 0) stack.push(pixel - width)
    if (pixelY + 1 < height) stack.push(pixel + width)
  }
  return mask
}

export function colorRangeMask(image: ImageData, color: [number, number, number], tolerance: number) {
  const mask = new Uint8ClampedArray(image.width * image.height)
  const limit = Math.max(0, Math.min(255, tolerance))
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const offset = pixel * 4
    const distance = Math.max(Math.abs(image.data[offset] - color[0]), Math.abs(image.data[offset + 1] - color[1]), Math.abs(image.data[offset + 2] - color[2]))
    mask[pixel] = distance <= limit ? Math.round((1 - distance / Math.max(1, limit + 1)) * image.data[offset + 3]) : 0
  }
  return mask
}

export function luminosityRangeMask(image: ImageData, minimum: number, maximum: number, feather = 16) {
  const mask = new Uint8ClampedArray(image.width * image.height)
  const low = Math.max(0, Math.min(255, minimum))
  const high = Math.max(low, Math.min(255, maximum))
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const offset = pixel * 4
    const luminance = image.data[offset] * 0.2126 + image.data[offset + 1] * 0.7152 + image.data[offset + 2] * 0.0722
    const coverage = luminance < low ? 1 - (low - luminance) / Math.max(1, feather) : luminance > high ? 1 - (luminance - high) / Math.max(1, feather) : 1
    mask[pixel] = Math.round(Math.max(0, Math.min(1, coverage)) * image.data[offset + 3])
  }
  return mask
}

export function edgeSelectionMask(image: ImageData, threshold = 32) {
  const mask = new Uint8ClampedArray(image.width * image.height)
  const luminance = (x: number, y: number) => {
    const offset = (Math.max(0, Math.min(image.height - 1, y)) * image.width + Math.max(0, Math.min(image.width - 1, x))) * 4
    return image.data[offset] * 0.2126 + image.data[offset + 1] * 0.7152 + image.data[offset + 2] * 0.0722
  }
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    const gradient = Math.hypot(luminance(x + 1, y) - luminance(x - 1, y), luminance(x, y + 1) - luminance(x, y - 1))
    mask[y * image.width + x] = gradient >= threshold ? Math.min(255, Math.round(gradient * 2)) : 0
  }
  return mask
}

export function growSelectionMask(selection: SelectionState, image: ImageData, tolerance: number) {
  const context = selection.mask.getContext('2d', { willReadFrequently: true })
  if (!context || image.width !== selection.mask.width || image.height !== selection.mask.height) return new Uint8ClampedArray(image.width * image.height)
  const selected = context.getImageData(0, 0, image.width, image.height).data
  const output = new Uint8ClampedArray(image.width * image.height)
  for (let pixel = 0; pixel < output.length; pixel += 1) output[pixel] = selected[pixel * 4 + 3]
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    const pixel = y * image.width + x
    if (output[pixel]) continue
    for (const neighbour of [x > 0 ? pixel - 1 : -1, x + 1 < image.width ? pixel + 1 : -1, y > 0 ? pixel - image.width : -1, y + 1 < image.height ? pixel + image.width : -1]) {
      if (neighbour < 0 || !selected[neighbour * 4 + 3]) continue
      const offset = pixel * 4
      const other = neighbour * 4
      if (Math.max(Math.abs(image.data[offset] - image.data[other]), Math.abs(image.data[offset + 1] - image.data[other + 1]), Math.abs(image.data[offset + 2] - image.data[other + 2])) <= tolerance) output[pixel] = image.data[offset + 3]
    }
  }
  return output
}

export function similarSelectionMask(selection: SelectionState, image: ImageData, tolerance: number) {
  const context = selection.mask.getContext('2d', { willReadFrequently: true })
  if (!context) return new Uint8ClampedArray(image.width * image.height)
  const selected = context.getImageData(0, 0, image.width, image.height).data
  const totals = [0, 0, 0]
  let count = 0
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) if (selected[pixel * 4 + 3]) {
    totals[0] += image.data[pixel * 4]
    totals[1] += image.data[pixel * 4 + 1]
    totals[2] += image.data[pixel * 4 + 2]
    count += 1
  }
  return count ? colorRangeMask(image, totals.map((value) => Math.round(value / count)) as [number, number, number], tolerance) : new Uint8ClampedArray(image.width * image.height)
}

export function applySelectionAlphaMask(current: SelectionState | null, alpha: Uint8ClampedArray, mode: SelectionMode, width: number, height: number): SelectionState {
  const selection = current?.mask.width === width && current.mask.height === height ? current : createSelection(width, height)
  if (alpha.length !== width * height) return selection
  const temporary = createMask(width, height)
  const context = temporary.getContext('2d')
  if (!context) return selection
  const image = context.createImageData(width, height)
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    image.data[pixel * 4] = 255
    image.data[pixel * 4 + 1] = 255
    image.data[pixel * 4 + 2] = 255
    image.data[pixel * 4 + 3] = alpha[pixel]
  }
  context.putImageData(image, 0, 0)
  return applyTemporaryMask(selection, temporary, mode, width, height)
}

export type ComponentChannel = 'red' | 'green' | 'blue' | 'cyan' | 'magenta' | 'yellow' | 'black'

export function componentChannelMask(image: ImageData, channel: ComponentChannel) {
  const alpha = new Uint8ClampedArray(image.width * image.height)
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const offset = pixel * 4
    const red = image.data[offset]
    const green = image.data[offset + 1]
    const blue = image.data[offset + 2]
    alpha[pixel] = channel === 'red' ? red
      : channel === 'green' ? green
        : channel === 'blue' ? blue
          : channel === 'cyan' ? 255 - red
            : channel === 'magenta' ? 255 - green
              : channel === 'yellow' ? 255 - blue
                : 255 - Math.max(red, green, blue)
  }
  return alpha
}

export function selectAll(width: number, height: number) {
  return applySelectionShape(null, { kind: 'rectangle', x: 0, y: 0, width, height }, 'replace', width, height)
}

export function invertSelection(current: SelectionState | null, width: number, height: number) {
  const selection = current?.mask.width === width && current.mask.height === height ? current : createSelection(width, height)
  const context = selection.mask.getContext('2d', { willReadFrequently: true })
  if (!context) return selection
  const image = context.getImageData(0, 0, width, height)
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4
    image.data[offset] = 255
    image.data[offset + 1] = 255
    image.data[offset + 2] = 255
    image.data[offset + 3] = 255 - image.data[offset + 3]
  }
  context.putImageData(image, 0, 0)
  return synchronizedSelection(selection.mask, selection.revision + 1)
}

export function featherSelection(current: SelectionState | null, radius: number) {
  if (!current?.bounds || radius <= 0) return current
  const temporary = createMask(current.mask.width, current.mask.height)
  const temporaryContext = temporary.getContext('2d')
  const context = current.mask.getContext('2d', { willReadFrequently: true })
  if (!temporaryContext || !context) return current
  temporaryContext.filter = `blur(${radius}px)`
  temporaryContext.drawImage(current.mask, 0, 0)
  context.clearRect(0, 0, current.mask.width, current.mask.height)
  context.drawImage(temporary, 0, 0)
  return synchronizedSelection(current.mask, current.revision + 1)
}

export function morphSelection(current: SelectionState | null, radius: number, mode: 'expand' | 'contract') {
  if (!current?.bounds || radius <= 0) return current
  const context = current.mask.getContext('2d', { willReadFrequently: true })
  if (!context) return current
  const { width, height } = current.mask
  const image = context.getImageData(0, 0, width, height)
  const source = new Uint8ClampedArray(width * height)
  for (let pixel = 0; pixel < source.length; pixel += 1) source[pixel] = image.data[pixel * 4 + 3]
  const horizontal = new Uint8ClampedArray(source.length)
  const output = new Uint8ClampedArray(source.length)
  const pick = mode === 'expand' ? Math.max : Math.min
  const outside = mode === 'expand' ? 0 : 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = mode === 'expand' ? 0 : 255
      for (let offset = -radius; offset <= radius; offset += 1) value = pick(value, x + offset < 0 || x + offset >= width ? outside : source[y * width + x + offset])
      horizontal[y * width + x] = value
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = mode === 'expand' ? 0 : 255
      for (let offset = -radius; offset <= radius; offset += 1) value = pick(value, y + offset < 0 || y + offset >= height ? outside : horizontal[(y + offset) * width + x])
      output[y * width + x] = value
    }
  }
  for (let pixel = 0; pixel < output.length; pixel += 1) {
    image.data[pixel * 4] = 255
    image.data[pixel * 4 + 1] = 255
    image.data[pixel * 4 + 2] = 255
    image.data[pixel * 4 + 3] = output[pixel]
  }
  context.putImageData(image, 0, 0)
  return synchronizedSelection(current.mask, current.revision + 1)
}

export type SelectionRefinement = { radius: number; feather: number; contrast: number; shiftEdge: number; decontamination: number }

export function refineSelection(source: SelectionState, settings: SelectionRefinement) {
  let selection = cloneSelection(source)
  const edgeShift = Math.round(Math.abs(settings.shiftEdge) / 10)
  if (edgeShift > 0) selection = morphSelection(selection, edgeShift, settings.shiftEdge > 0 ? 'expand' : 'contract') ?? selection
  const radius = Math.round(Math.max(0, settings.radius))
  if (radius > 0) selection = morphSelection(selection, radius, 'expand') ?? selection
  if (settings.feather > 0) selection = featherSelection(selection, settings.feather) ?? selection
  const context = selection.mask.getContext('2d', { willReadFrequently: true })
  if (!context) return selection
  const image = context.getImageData(0, 0, selection.mask.width, selection.mask.height)
  const contrast = Math.max(0, Math.min(100, settings.contrast)) / 100
  const decontamination = Math.max(0, Math.min(100, settings.decontamination)) / 100
  for (let offset = 3; offset < image.data.length; offset += 4) {
    let alpha = image.data[offset] / 255
    alpha = Math.max(0, Math.min(1, (alpha - 0.5) * (1 + contrast * 4) + 0.5))
    if (decontamination > 0 && alpha < 0.5) alpha *= 1 - decontamination * (1 - alpha * 2)
    image.data[offset] = Math.round(alpha * 255)
  }
  context.putImageData(image, 0, 0)
  return synchronizedSelection(selection.mask, source.revision + 1)
}

export function selectionAlphaAt(data: ImageData, x: number, y: number) {
  const pixelX = Math.round(x)
  const pixelY = Math.round(y)
  if (pixelX < 0 || pixelY < 0 || pixelX >= data.width || pixelY >= data.height) return 0
  return data.data[(pixelY * data.width + pixelX) * 4 + 3] / 255
}
