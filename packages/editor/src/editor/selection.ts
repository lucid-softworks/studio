export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect'
export type SelectionShape = { kind: 'rectangle' | 'ellipse'; x: number; y: number; width: number; height: number }
export type SelectionBounds = { x: number; y: number; width: number; height: number }
export type SelectionState = { mask: HTMLCanvasElement; bounds: SelectionBounds | null; revision: number }

function createMask(width: number, height: number) {
  const mask = document.createElement('canvas')
  mask.width = width
  mask.height = height
  return mask
}

export function createSelection(width: number, height: number): SelectionState {
  return { mask: createMask(width, height), bounds: null, revision: 0 }
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
  return { mask: selection.mask, bounds: selectionBounds(selection.mask), revision: selection.revision + 1 }
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
  return { mask: selection.mask, bounds: selectionBounds(selection.mask), revision: selection.revision + 1 }
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
  return { mask: current.mask, bounds: selectionBounds(current.mask), revision: current.revision + 1 }
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
  return { mask: current.mask, bounds: selectionBounds(current.mask), revision: current.revision + 1 }
}

export function selectionAlphaAt(data: ImageData, x: number, y: number) {
  const pixelX = Math.round(x)
  const pixelY = Math.round(y)
  if (pixelX < 0 || pixelY < 0 || pixelX >= data.width || pixelY >= data.height) return 0
  return data.data[(pixelY * data.width + pixelX) * 4 + 3] / 255
}
