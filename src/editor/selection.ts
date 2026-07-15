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

export function applySelectionShape(current: SelectionState | null, shape: SelectionShape, mode: SelectionMode, width: number, height: number): SelectionState {
  const selection = current?.mask.width === width && current.mask.height === height ? current : createSelection(width, height)
  const mask = selection.mask
  const context = mask.getContext('2d', { willReadFrequently: true })
  if (!context) return selection

  const temporary = createMask(width, height)
  const temporaryContext = temporary.getContext('2d')
  if (!temporaryContext) return selection
  temporaryContext.fillStyle = '#ffffff'
  drawShape(temporaryContext, shape)

  if (mode === 'replace') {
    context.clearRect(0, 0, width, height)
    context.drawImage(temporary, 0, 0)
  } else {
    context.save()
    context.globalCompositeOperation = mode === 'add' ? 'source-over' : mode === 'subtract' ? 'destination-out' : 'destination-in'
    context.drawImage(temporary, 0, 0)
    context.restore()
  }

  return { mask, bounds: selectionBounds(mask), revision: selection.revision + 1 }
}

export function selectionAlphaAt(data: ImageData, x: number, y: number) {
  const pixelX = Math.round(x)
  const pixelY = Math.round(y)
  if (pixelX < 0 || pixelY < 0 || pixelX >= data.width || pixelY >= data.height) return 0
  return data.data[(pixelY * data.width + pixelX) * 4 + 3] / 255
}
