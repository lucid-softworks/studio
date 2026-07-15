import { getDocumentSize } from './presets'
import { flattenStackLayers, getStackChildren, layerIsLocked, layerIsVisible, type StackItem } from './stack'
import type { AdjustmentLayer, AssetMap, EditorDocument, EditorLayer, ImageLayer, Position, RasterLayer, ShapeLayer, TextLayer } from './types'

export type LayerBounds = { x: number; y: number; width: number; height: number; rotation: number }
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export function calculateImageRect(
  canvasWidth: number,
  canvasHeight: number,
  imageWidth: number,
  imageHeight: number,
  layer: Pick<ImageLayer, 'padding' | 'scale' | 'position' | 'rotation'>,
): LayerBounds {
  const paddingX = canvasWidth * (layer.padding / 100)
  const paddingY = canvasHeight * (layer.padding / 100)
  const availableWidth = Math.max(1, canvasWidth - paddingX * 2)
  const availableHeight = Math.max(1, canvasHeight - paddingY * 2)
  const fitScale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight)
  const scale = fitScale * (layer.scale / 100)
  const width = imageWidth * scale
  const height = imageHeight * scale

  return {
    x: (canvasWidth - width) / 2 + layer.position.x * canvasWidth,
    y: (canvasHeight - height) / 2 + layer.position.y * canvasHeight,
    width,
    height,
    rotation: layer.rotation,
  }
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
}

function drawGradient(context: CanvasRenderingContext2D, width: number, height: number, colors: [string, string], angleValue: number) {
  const angle = (angleValue * Math.PI) / 180
  const centerX = width / 2
  const centerY = height / 2
  const radius = Math.abs(width * Math.sin(angle)) + Math.abs(height * Math.cos(angle))
  const x = Math.cos(angle) * radius * 0.5
  const y = Math.sin(angle) * radius * 0.5
  const gradient = context.createLinearGradient(centerX - x, centerY - y, centerX + x, centerY + y)
  gradient.addColorStop(0, colors[0])
  gradient.addColorStop(1, colors[1])
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)
}

function drawBackground(context: CanvasRenderingContext2D, width: number, height: number, document: EditorDocument, assets: AssetMap) {
  const background = document.background
  if (background.kind === 'transparent') {
    context.clearRect(0, 0, width, height)
  } else if (background.kind === 'solid') {
    context.fillStyle = background.solidColor
    context.fillRect(0, 0, width, height)
  } else if (background.kind === 'image' && background.imageAssetId && assets[background.imageAssetId]) {
    context.save()
    context.filter = background.imageBlur ? `blur(${background.imageBlur}px)` : 'none'
    const bleed = background.imageBlur * 2
    context.translate(-bleed, -bleed)
    drawCover(context, assets[background.imageAssetId].element, width + bleed * 2, height + bleed * 2)
    context.restore()
    if (background.imageOverlay > 0) {
      context.fillStyle = `rgba(0,0,0,${background.imageOverlay / 100})`
      context.fillRect(0, 0, width, height)
    }
  } else {
    drawGradient(context, width, height, background.gradient, background.gradientAngle)
    const glow = context.createRadialGradient(width * 0.75, height * 0.1, 0, width * 0.75, height * 0.1, width * 0.75)
    glow.addColorStop(0, 'rgba(255,255,255,0.12)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = glow
    context.fillRect(0, 0, width, height)
  }
}

function drawPattern(context: CanvasRenderingContext2D, width: number, height: number, document: EditorDocument) {
  const pattern = document.pattern
  if (pattern.kind === 'none' || pattern.opacity === 0) return
  const spacing = Math.max(12, pattern.size)
  context.save()
  context.globalAlpha = pattern.opacity / 100
  context.strokeStyle = pattern.color
  context.fillStyle = pattern.color
  context.lineWidth = Math.max(1, width / 1200)

  if (pattern.kind === 'grid') {
    context.beginPath()
    for (let x = 0; x <= width; x += spacing) {
      context.moveTo(x, 0)
      context.lineTo(x, height)
    }
    for (let y = 0; y <= height; y += spacing) {
      context.moveTo(0, y)
      context.lineTo(width, y)
    }
    context.stroke()
  } else if (pattern.kind === 'dots') {
    const radius = Math.max(1.5, spacing / 16)
    for (let x = spacing / 2; x < width; x += spacing) {
      for (let y = spacing / 2; y < height; y += spacing) {
        context.beginPath()
        context.arc(x, y, radius, 0, Math.PI * 2)
        context.fill()
      }
    }
  } else {
    for (let y = spacing; y < height + spacing; y += spacing) {
      context.beginPath()
      for (let x = 0; x <= width; x += 12) {
        const waveY = y + Math.sin((x / spacing) * Math.PI * 2) * (spacing * 0.18)
        if (x === 0) context.moveTo(x, waveY)
        else context.lineTo(x, waveY)
      }
      context.stroke()
    }
  }
  context.restore()
}

function withLayerTransform(
  context: CanvasRenderingContext2D,
  bounds: LayerBounds,
  flipX: boolean,
  flipY: boolean,
  draw: () => void,
) {
  context.save()
  context.translate(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  context.rotate((bounds.rotation * Math.PI) / 180)
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1)
  draw()
  context.restore()
}

function drawImageLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: ImageLayer, assets: AssetMap) {
  const asset = assets[layer.assetId]
  if (!asset) return
  const bounds = calculateImageRect(canvas.width, canvas.height, asset.element.naturalWidth, asset.element.naturalHeight, layer)
  const radius = Math.min(layer.cornerRadius, bounds.width / 2, bounds.height / 2)

  context.globalAlpha = layer.opacity / 100
  withLayerTransform(context, bounds, layer.flipX, layer.flipY, () => {
    const x = -bounds.width / 2
    const y = -bounds.height / 2
    if (layer.shadow > 0) {
      context.save()
      context.shadowColor = `rgba(5,5,10,${Math.min(0.55, 0.18 + layer.shadow / 180)})`
      context.shadowBlur = layer.shadow * 1.25
      context.shadowOffsetY = layer.shadow * 0.35
      context.fillStyle = 'rgba(255,255,255,0.98)'
      context.beginPath()
      context.roundRect(x, y, bounds.width, bounds.height, radius)
      context.fill()
      context.restore()
    }
    context.save()
    context.beginPath()
    context.roundRect(x, y, bounds.width, bounds.height, radius)
    context.clip()
    context.drawImage(asset.surface ?? asset.element, x, y, bounds.width, bounds.height)
    context.restore()
    context.strokeStyle = 'rgba(255,255,255,0.16)'
    context.lineWidth = Math.max(1, canvas.width / 900)
    context.beginPath()
    context.roundRect(x, y, bounds.width, bounds.height, radius)
    context.stroke()
  })
  context.globalAlpha = 1
}

function rasterBounds(canvas: HTMLCanvasElement, layer: RasterLayer): LayerBounds {
  const width = layer.width * layer.scale / 100
  const height = layer.height * layer.scale / 100
  return {
    x: canvas.width / 2 - width / 2 + layer.position.x * canvas.width,
    y: canvas.height / 2 - height / 2 + layer.position.y * canvas.height,
    width,
    height,
    rotation: layer.rotation,
  }
}

function drawRasterLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: RasterLayer, assets: AssetMap) {
  const asset = assets[layer.assetId]
  if (!asset) return
  const bounds = rasterBounds(canvas, layer)
  context.globalAlpha = layer.opacity / 100
  withLayerTransform(context, bounds, false, false, () => {
    context.drawImage(asset.surface ?? asset.element, -bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height)
  })
  context.globalAlpha = 1
}

function setTextStyle(context: CanvasRenderingContext2D, layer: TextLayer) {
  context.font = `${layer.fontWeight} ${layer.fontSize}px Inter, system-ui, sans-serif`
  context.textBaseline = 'middle'
  context.textAlign = layer.textAlign
  ;(context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${layer.letterSpacing}px`
}

function textMetrics(context: CanvasRenderingContext2D, layer: TextLayer) {
  context.save()
  setTextStyle(context, layer)
  const lines = layer.text.split('\n')
  const width = Math.max(layer.fontSize, ...lines.map((line) => context.measureText(line || ' ').width))
  const lineHeight = layer.fontSize * 1.18
  context.restore()
  return { lines, width, height: lineHeight * lines.length, lineHeight }
}

function drawTextLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: TextLayer) {
  const metrics = textMetrics(context, layer)
  const centerX = canvas.width / 2 + layer.position.x * canvas.width
  const centerY = canvas.height / 2 + layer.position.y * canvas.height
  const bounds = { x: centerX - metrics.width / 2, y: centerY - metrics.height / 2, width: metrics.width, height: metrics.height, rotation: layer.rotation }

  context.globalAlpha = layer.opacity / 100
  withLayerTransform(context, bounds, false, false, () => {
    setTextStyle(context, layer)
    context.fillStyle = layer.color
    const x = layer.textAlign === 'left' ? -metrics.width / 2 : layer.textAlign === 'right' ? metrics.width / 2 : 0
    metrics.lines.forEach((line, index) => {
      const y = -metrics.height / 2 + metrics.lineHeight / 2 + index * metrics.lineHeight
      context.fillText(line, x, y)
    })
  })
  context.globalAlpha = 1
}

function shapeBounds(canvas: HTMLCanvasElement, layer: ShapeLayer): LayerBounds {
  const width = canvas.width * (layer.width / 100)
  const height = canvas.height * (layer.height / 100)
  return {
    x: canvas.width / 2 - width / 2 + layer.position.x * canvas.width,
    y: canvas.height / 2 - height / 2 + layer.position.y * canvas.height,
    width,
    height,
    rotation: layer.rotation,
  }
}

function drawShapeLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: ShapeLayer) {
  const bounds = shapeBounds(canvas, layer)
  context.globalAlpha = layer.opacity / 100
  withLayerTransform(context, bounds, false, false, () => {
    const x = -bounds.width / 2
    const y = -bounds.height / 2
    context.beginPath()
    if (layer.shape === 'ellipse') context.ellipse(0, 0, bounds.width / 2, bounds.height / 2, 0, 0, Math.PI * 2)
    else context.roundRect(x, y, bounds.width, bounds.height, Math.min(layer.cornerRadius, bounds.width / 2, bounds.height / 2))
    context.fillStyle = layer.fill
    context.fill()
    if (layer.strokeWidth > 0) {
      context.strokeStyle = layer.stroke
      context.lineWidth = layer.strokeWidth
      context.stroke()
    }
  })
  context.globalAlpha = 1
}

function drawEditorLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: EditorLayer, assets: AssetMap) {
  if (layer.type === 'image') drawImageLayer(context, canvas, layer, assets)
  else if (layer.type === 'raster') drawRasterLayer(context, canvas, layer, assets)
  else if (layer.type === 'text') drawTextLayer(context, canvas, layer)
  else if (layer.type === 'shape') drawShapeLayer(context, canvas, layer)
}

let maskCompositionCanvas: HTMLCanvasElement | null = null

function drawMaskedLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: EditorLayer, assets: AssetMap) {
  const mask = layer.maskAssetId ? assets[layer.maskAssetId] : null
  const maskSource = mask?.surface ?? mask?.element
  if (!maskSource) {
    drawEditorLayer(context, canvas, layer, assets)
    return
  }

  const composition = maskCompositionCanvas ?? document.createElement('canvas')
  maskCompositionCanvas = composition
  if (composition.width !== canvas.width) composition.width = canvas.width
  if (composition.height !== canvas.height) composition.height = canvas.height
  const compositionContext = composition.getContext('2d')
  if (!compositionContext) return
  compositionContext.clearRect(0, 0, composition.width, composition.height)
  drawEditorLayer(compositionContext, composition, layer, assets)
  compositionContext.save()
  compositionContext.globalAlpha = 1
  compositionContext.globalCompositeOperation = 'destination-in'
  compositionContext.drawImage(maskSource, 0, 0, composition.width, composition.height)
  compositionContext.restore()
  context.drawImage(composition, 0, 0)
}

let clippedLayerCanvas: HTMLCanvasElement | null = null
let clippingBaseCanvas: HTMLCanvasElement | null = null
let adjustmentCanvas: HTMLCanvasElement | null = null

function prepareScratchCanvas(current: HTMLCanvasElement | null, canvas: HTMLCanvasElement) {
  const scratch = current ?? document.createElement('canvas')
  if (scratch.width !== canvas.width) scratch.width = canvas.width
  if (scratch.height !== canvas.height) scratch.height = canvas.height
  return scratch
}

function drawClippedLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: EditorLayer, base: EditorLayer, assets: AssetMap) {
  clippedLayerCanvas = prepareScratchCanvas(clippedLayerCanvas, canvas)
  clippingBaseCanvas = prepareScratchCanvas(clippingBaseCanvas, canvas)
  const layerContext = clippedLayerCanvas.getContext('2d')
  const baseContext = clippingBaseCanvas.getContext('2d')
  if (!layerContext || !baseContext) return
  layerContext.clearRect(0, 0, canvas.width, canvas.height)
  baseContext.clearRect(0, 0, canvas.width, canvas.height)
  drawMaskedLayer(layerContext, clippedLayerCanvas, layer, assets)
  drawMaskedLayer(baseContext, clippingBaseCanvas, base, assets)
  layerContext.save()
  layerContext.globalAlpha = 1
  layerContext.globalCompositeOperation = 'destination-in'
  layerContext.drawImage(clippingBaseCanvas, 0, 0)
  layerContext.restore()
  context.drawImage(clippedLayerCanvas, 0, 0)
}

function drawAdjustmentLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: AdjustmentLayer) {
  adjustmentCanvas = prepareScratchCanvas(adjustmentCanvas, canvas)
  const adjustmentContext = adjustmentCanvas.getContext('2d')
  if (!adjustmentContext) return
  adjustmentContext.clearRect(0, 0, canvas.width, canvas.height)
  adjustmentContext.drawImage(canvas, 0, 0)
  context.save()
  context.globalAlpha = layer.opacity / 100
  context.globalCompositeOperation = layer.blendMode === 'normal' || !layer.blendMode ? 'source-over' : layer.blendMode
  context.filter = `brightness(${layer.brightness}%) contrast(${layer.contrast}%) saturate(${layer.saturation}%) hue-rotate(${layer.hue}deg) blur(${layer.blur}px)`
  context.drawImage(adjustmentCanvas, 0, 0)
  context.restore()
}

const groupCompositionCanvases: HTMLCanvasElement[] = []

function clippingBaseFor(items: StackItem[], index: number) {
  for (let candidateIndex = index - 1; candidateIndex >= 0; candidateIndex -= 1) {
    const item = items[candidateIndex]
    if (item.type === 'group') return null
    if (item.layer.type === 'adjustment' || item.layer.clipToBelow) continue
    return item.layer
  }
  return null
}

function drawDocumentStack(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  documentState: EditorDocument,
  assets: AssetMap,
  parentId: string | null = null,
  depth = 0,
  seen = new Set<string>(),
) {
  const items = getStackChildren(documentState, parentId)
  for (const [index, item] of items.entries()) {
    if (item.type === 'group') {
      const group = item.group
      if (!group.visible || seen.has(group.id)) continue
      const nextSeen = new Set(seen)
      nextSeen.add(group.id)
      if (group.passThrough && group.opacity === 100) {
        drawDocumentStack(context, canvas, documentState, assets, group.id, depth, nextSeen)
        continue
      }
      const groupCanvas = prepareScratchCanvas(groupCompositionCanvases[depth] ?? null, canvas)
      groupCompositionCanvases[depth] = groupCanvas
      const groupContext = groupCanvas.getContext('2d')
      if (!groupContext) continue
      groupContext.clearRect(0, 0, canvas.width, canvas.height)
      drawDocumentStack(groupContext, groupCanvas, documentState, assets, group.id, depth + 1, nextSeen)
      context.save()
      context.globalAlpha = group.opacity / 100
      context.globalCompositeOperation = group.blendMode === 'normal' ? 'source-over' : group.blendMode
      context.drawImage(groupCanvas, 0, 0)
      context.restore()
      continue
    }

    const layer = item.layer
    if (!layer.visible) continue
    if (layer.type === 'adjustment') {
      drawAdjustmentLayer(context, canvas, layer)
      continue
    }
    context.save()
    context.globalCompositeOperation = layer.blendMode === 'normal' || !layer.blendMode ? 'source-over' : layer.blendMode
    if (layer.filters) context.filter = `brightness(${layer.filters.brightness}%) contrast(${layer.filters.contrast}%) saturate(${layer.filters.saturation}%) blur(${layer.filters.blur}px)`
    const clippingBase = layer.clipToBelow ? clippingBaseFor(items, index) : null
    if (clippingBase?.visible) drawClippedLayer(context, canvas, layer, clippingBase, assets)
    else if (!clippingBase) drawMaskedLayer(context, canvas, layer, assets)
    context.restore()
  }
}

export function getLayerBounds(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  layer: EditorLayer,
  assets: AssetMap,
): LayerBounds | null {
  if (layer.type === 'image') {
    const asset = assets[layer.assetId]
    return asset ? calculateImageRect(canvas.width, canvas.height, asset.element.naturalWidth, asset.element.naturalHeight, layer) : null
  }
  if (layer.type === 'raster') return rasterBounds(canvas, layer)
  if (layer.type === 'shape') return shapeBounds(canvas, layer)
  if (layer.type === 'adjustment') return null
  const metrics = textMetrics(context, layer)
  return {
    x: canvas.width / 2 - metrics.width / 2 + layer.position.x * canvas.width,
    y: canvas.height / 2 - metrics.height / 2 + layer.position.y * canvas.height,
    width: metrics.width,
    height: metrics.height,
    rotation: layer.rotation,
  }
}

function pointInsideRotatedBounds(point: Position, bounds: LayerBounds) {
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const angle = (-bounds.rotation * Math.PI) / 180
  const dx = point.x - centerX
  const dy = point.y - centerY
  const x = centerX + dx * Math.cos(angle) - dy * Math.sin(angle)
  const y = centerY + dx * Math.sin(angle) + dy * Math.cos(angle)
  return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height
}

export function getResizeHandles(bounds: LayerBounds): Record<ResizeHandle, Position> {
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const angle = (bounds.rotation * Math.PI) / 180
  const rotate = (x: number, y: number) => {
    const dx = x - centerX
    const dy = y - centerY
    return {
      x: centerX + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: centerY + dx * Math.sin(angle) + dy * Math.cos(angle),
    }
  }
  return {
    nw: rotate(bounds.x, bounds.y),
    n: rotate(bounds.x + bounds.width / 2, bounds.y),
    ne: rotate(bounds.x + bounds.width, bounds.y),
    e: rotate(bounds.x + bounds.width, bounds.y + bounds.height / 2),
    se: rotate(bounds.x + bounds.width, bounds.y + bounds.height),
    s: rotate(bounds.x + bounds.width / 2, bounds.y + bounds.height),
    sw: rotate(bounds.x, bounds.y + bounds.height),
    w: rotate(bounds.x, bounds.y + bounds.height / 2),
  }
}

export function findResizeHandle(point: Position, bounds: LayerBounds, tolerance: number): ResizeHandle | null {
  const handles = getResizeHandles(bounds)
  for (const [name, position] of Object.entries(handles) as [ResizeHandle, Position][]) {
    if (Math.hypot(point.x - position.x, point.y - position.y) <= tolerance) return name
  }
  return null
}

export function findLayerAtPoint(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  document: EditorDocument,
  assets: AssetMap,
  point: Position,
) {
  return flattenStackLayers(document).findLast((layer) => {
    if (!layerIsVisible(document, layer) || layerIsLocked(document, layer)) return false
    const bounds = getLayerBounds(context, canvas, layer, assets)
    return bounds ? pointInsideRotatedBounds(point, bounds) : false
  }) ?? null
}

function drawSelection(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: EditorLayer, assets: AssetMap) {
  const bounds = getLayerBounds(context, canvas, layer, assets)
  if (!bounds) return
  withLayerTransform(context, bounds, false, false, () => {
    const x = -bounds.width / 2
    const y = -bounds.height / 2
    context.save()
    context.strokeStyle = '#a78bfa'
    context.lineWidth = Math.max(2, canvas.width / 700)
    context.setLineDash([10, 7])
    context.strokeRect(x - 4, y - 4, bounds.width + 8, bounds.height + 8)
    context.setLineDash([])
    context.fillStyle = '#f5f3ff'
    for (const [handleX, handleY] of [[x, y], [x + bounds.width, y], [x + bounds.width, y + bounds.height], [x, y + bounds.height]]) {
      context.beginPath()
      context.arc(handleX, handleY, Math.max(5, canvas.width / 280), 0, Math.PI * 2)
      context.fill()
      context.strokeStyle = '#7c3aed'
      context.stroke()
    }
    context.restore()
  })
}

export function renderComposition(
  canvas: HTMLCanvasElement,
  document: EditorDocument,
  assets: AssetMap,
  options: { showSelection?: boolean } = {},
) {
  const preset = getDocumentSize(document)
  if (canvas.width !== preset.width) canvas.width = preset.width
  if (canvas.height !== preset.height) canvas.height = preset.height
  const context = canvas.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, canvas.width, canvas.height)
  drawBackground(context, canvas.width, canvas.height, document, assets)
  drawPattern(context, canvas.width, canvas.height, document)

  drawDocumentStack(context, canvas, document, assets)

  if (options.showSelection && document.selectedLayerId) {
    const selected = document.layers.find((layer) => layer.id === document.selectedLayerId)
    if (selected?.visible) drawSelection(context, canvas, selected, assets)
  }
}
