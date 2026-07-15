import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { getLayerBounds, type LayerBounds } from '../editor/renderer'
import { extractImageData, type RasterEdit } from '../editor/raster'
import { selectionAlphaAt, type SelectionState } from '../editor/selection'
import type { AssetMap } from '../editor/runtime-assets'
import type { EditorDocument, Position, RasterLayer } from '../editor/types'
import type { BrushPreset } from '../editor/resources'
import { brushStampAlpha, brushStampRadius, interpolateBrushStamps, normalizePointerPressure } from '../editor/brush-engine'

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  document: EditorDocument
  assets: AssetMap
  tool: 'brush' | 'eraser' | 'dodge' | 'burn'
  brush: BrushPreset
  size: number
  color: string
  hardness: number
  opacity: number
  flow: number
  pressureSize: boolean
  pressureOpacity: boolean
  selection: SelectionState | null
  maskAssetId?: string
  maskLocked?: boolean
  locked?: boolean
  onChange: (assetId: string) => void
  onCommit: (edit: RasterEdit) => void
}

type Stroke = {
  pointerId: number
  layer: RasterLayer
  before: ImageData
  last: Position
  lastPressure: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  radius: number
  bounds: LayerBounds
  selectionData: ImageData | null
}

export function RasterPaintOverlay({ canvasRef, document, assets, tool, brush, size, color, hardness, opacity, flow, pressureSize, pressureOpacity, selection, maskAssetId, maskLocked, locked, onChange, onCommit }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const strokeRef = useRef<Stroke | null>(null)
  const roundTipRef = useRef<{ hardness: number; surface: HTMLCanvasElement } | null>(null)
  const tintedTipRef = useRef<{ tipId: string; color: string; surface: HTMLCanvasElement } | null>(null)
  const canvas = canvasRef.current
  const selectedRasterLayer = document.layers.find((candidate) => candidate.id === document.selectedLayerId && candidate.type === 'raster') as RasterLayer | undefined
  const maskSurface = maskAssetId ? assets[maskAssetId]?.surface : undefined
  const layer: RasterLayer | undefined = maskAssetId && maskSurface ? {
    id: `mask-${maskAssetId}`,
    name: 'Layer mask',
    type: 'raster',
    assetId: maskAssetId,
    visible: true,
    locked: Boolean(maskLocked),
    opacity: 100,
    position: { x: 0, y: 0 },
    rotation: 0,
    width: canvas?.width ?? maskSurface.width,
    height: canvas?.height ?? maskSurface.height,
    scale: 100,
  } : selectedRasterLayer
  const asset = layer ? assets[layer.assetId] : undefined
  const surface = asset?.surface

  const canvasPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / rect.width * svg.viewBox.baseVal.width, y: (event.clientY - rect.top) / rect.height * svg.viewBox.baseVal.height }
  }

  const sourcePoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!canvas || !layer || !surface) return null
    const context = canvas.getContext('2d')
    const bounds = context ? getLayerBounds(context, canvas, layer, assets) : null
    if (!bounds) return null
    const point = canvasPoint(event)
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2
    const angle = -bounds.rotation * Math.PI / 180
    const dx = point.x - centerX
    const dy = point.y - centerY
    const localX = dx * Math.cos(angle) - dy * Math.sin(angle)
    const localY = dx * Math.sin(angle) + dy * Math.cos(angle)
    return {
      point: { x: (localX / bounds.width + 0.5) * surface.width, y: (localY / bounds.height + 0.5) * surface.height },
      radius: Math.max(0.5, size / (bounds.width / surface.width) / 2),
      pressure: normalizePointerPressure(event.pointerType, event.pressure),
      bounds,
    }
  }

  const roundTip = () => {
    const cached = roundTipRef.current
    if (cached?.hardness === hardness) return cached.surface
    const tip = globalThis.document.createElement('canvas')
    tip.width = 128
    tip.height = 128
    const tipContext = tip.getContext('2d')
    if (!tipContext) return null
    const gradient = tipContext.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, '#ffffff')
    if (hardness > 0) gradient.addColorStop(Math.min(0.99, hardness / 100), '#ffffff')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    tipContext.fillStyle = gradient
    tipContext.fillRect(0, 0, 128, 128)
    roundTipRef.current = { hardness, surface: tip }
    return tip
  }

  const draw = (from: Position, to: Position, radius: number, fromPressure: number, toPressure: number) => {
    if (!surface) return
    const context = surface.getContext('2d', { willReadFrequently: true })
    if (!context) return
    context.save()
    context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : tool === 'dodge' || tool === 'burn' ? 'soft-light' : 'source-over'
    const strokeColor = tool === 'dodge' ? '#ffffff' : tool === 'burn' ? '#000000' : maskAssetId ? '#ffffff' : color
    context.strokeStyle = strokeColor
    context.fillStyle = strokeColor
    const sourceTip = brush.tip ?? roundTip()
    if (!sourceTip) { context.restore(); return }
    const tipId = brush.tip ? brush.id : `${brush.id}:${hardness}`
    let tip = sourceTip
    if (tool !== 'eraser') {
      const cached = tintedTipRef.current
      if (cached?.tipId === tipId && cached.color === strokeColor) tip = cached.surface
      else {
        const tinted = globalThis.document.createElement('canvas')
        tinted.width = sourceTip.width
        tinted.height = sourceTip.height
        const tintedContext = tinted.getContext('2d')
        if (!tintedContext) { context.restore(); return }
        tintedContext.drawImage(sourceTip, 0, 0)
        tintedContext.globalCompositeOperation = 'source-in'
        tintedContext.fillStyle = strokeColor
        tintedContext.fillRect(0, 0, tinted.width, tinted.height)
        tintedTipRef.current = { tipId, color: strokeColor, surface: tinted }
        tip = tinted
      }
    }
    for (const stamp of interpolateBrushStamps(from, to, fromPressure, toPressure, radius * 2, brush.spacing)) {
      const stampRadius = brushStampRadius(radius, stamp.pressure, pressureSize)
      context.globalAlpha = brushStampAlpha(opacity, flow, stamp.pressure, pressureOpacity)
      context.drawImage(tip, stamp.x - stampRadius, stamp.y - stampRadius, stampRadius * 2, stampRadius * 2)
    }
    context.restore()
  }

  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!layer || layer.locked || locked || !surface) return
    const mapped = sourcePoint(event)
    const context = surface.getContext('2d', { willReadFrequently: true })
    if (!mapped || !context) return
    event.preventDefault()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Synthetic events do not expose capture. */ }
    const { point, radius, pressure, bounds } = mapped
    const selectionContext = selection?.mask.getContext('2d', { willReadFrequently: true })
    strokeRef.current = {
      pointerId: event.pointerId,
      layer,
      before: context.getImageData(0, 0, surface.width, surface.height),
      last: point,
      lastPressure: pressure,
      minX: point.x - radius,
      minY: point.y - radius,
      maxX: point.x + radius,
      maxY: point.y + radius,
      radius,
      bounds,
      selectionData: selectionContext && selection?.bounds ? selectionContext.getImageData(0, 0, selection.mask.width, selection.mask.height) : null,
    }
    draw(point, point, radius, pressure, pressure)
    onChange(layer.assetId)
  }

  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const stroke = strokeRef.current
    if (!stroke || stroke.pointerId !== event.pointerId) return
    const mapped = sourcePoint(event)
    if (!mapped) return
    draw(stroke.last, mapped.point, stroke.radius, stroke.lastPressure, mapped.pressure)
    stroke.last = mapped.point
    stroke.lastPressure = mapped.pressure
    stroke.minX = Math.min(stroke.minX, mapped.point.x - stroke.radius)
    stroke.minY = Math.min(stroke.minY, mapped.point.y - stroke.radius)
    stroke.maxX = Math.max(stroke.maxX, mapped.point.x + stroke.radius)
    stroke.maxY = Math.max(stroke.maxY, mapped.point.y + stroke.radius)
    onChange(stroke.layer.assetId)
  }

  const pointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    const stroke = strokeRef.current
    if (!stroke || stroke.pointerId !== event.pointerId || !surface) return
    const context = surface.getContext('2d', { willReadFrequently: true })
    strokeRef.current = null
    if (!context) return
    const x = Math.max(0, Math.floor(stroke.minX - 2))
    const y = Math.max(0, Math.floor(stroke.minY - 2))
    const width = Math.min(surface.width - x, Math.ceil(stroke.maxX + 2) - x)
    const height = Math.min(surface.height - y, Math.ceil(stroke.maxY + 2) - y)
    if (width <= 0 || height <= 0) return
    const before = extractImageData(stroke.before, x, y, width, height)
    const after = context.getImageData(x, y, width, height)
    if (stroke.selectionData) {
      const centerX = stroke.bounds.x + stroke.bounds.width / 2
      const centerY = stroke.bounds.y + stroke.bounds.height / 2
      const angle = stroke.bounds.rotation * Math.PI / 180
      for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) {
          const sourceX = x + column
          const sourceY = y + row
          const localX = (sourceX / surface.width - 0.5) * stroke.bounds.width
          const localY = (sourceY / surface.height - 0.5) * stroke.bounds.height
          const documentX = centerX + localX * Math.cos(angle) - localY * Math.sin(angle)
          const documentY = centerY + localX * Math.sin(angle) + localY * Math.cos(angle)
          const coverage = selectionAlphaAt(stroke.selectionData, documentX, documentY)
          const offset = (row * width + column) * 4
          for (let channel = 0; channel < 4; channel += 1) after.data[offset + channel] = Math.round(before.data[offset + channel] * (1 - coverage) + after.data[offset + channel] * coverage)
        }
      }
      context.putImageData(after, x, y)
      onChange(stroke.layer.assetId)
    }
    onCommit({ assetId: stroke.layer.assetId, x, y, before, after })
  }

  return (
    <svg
      ref={svgRef}
      aria-label={maskAssetId ? `Mask ${tool} surface` : `${tool === 'brush' ? 'Brush' : tool === 'eraser' ? 'Eraser' : tool === 'dodge' ? 'Dodge' : 'Burn'} surface`}
      viewBox={`0 0 ${canvas?.width ?? 1600} ${canvas?.height ?? 1000}`}
      preserveAspectRatio="none"
      className={`absolute inset-0 size-full touch-none ${layer && !layer.locked && !locked ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
    />
  )
}
