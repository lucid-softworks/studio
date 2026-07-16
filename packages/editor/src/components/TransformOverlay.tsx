import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { findLayerAtPoint, getLayerBounds, type LayerBounds, type ResizeHandle } from '../editor/renderer'
import { layerIsLocked, layerIsVisible } from '../editor/stack'
import { calculateLayerResize, calculateRotation, normalizeGeometryTransform, type TransformResizeSnapshot } from '../editor/transform'
import type { AssetMap } from '../editor/runtime-assets'
import type { EditorDispatch, EditorDocument, Position } from '../editor/types'
import { snapTranslation, type SnapBounds } from '../editor/snapping'

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  document: EditorDocument
  assets: AssetMap
  dispatch: EditorDispatch
  endHistoryGroup: () => void
  enabled?: boolean
}

type Interaction =
  | { mode: 'move'; pointerId: number; start: Position; bounds: SnapBounds; layers: Array<{ id: string; position: Position }> }
  | { mode: 'resize'; pointerId: number; snapshot: TransformResizeSnapshot }
  | { mode: 'rotate'; pointerId: number; layerId: string; bounds: LayerBounds; pointerOffset: number }
  | { mode: 'distort'; pointerId: number; layerId: string; bounds: LayerBounds; cornerIndex: number; source: ReturnType<typeof normalizeGeometryTransform>; perspective: boolean }

const handles: Array<{ id: ResizeHandle; x: number; y: number; cursor: string }> = [
  { id: 'nw', x: -0.5, y: -0.5, cursor: 'nwse-resize' },
  { id: 'n', x: 0, y: -0.5, cursor: 'ns-resize' },
  { id: 'ne', x: 0.5, y: -0.5, cursor: 'nesw-resize' },
  { id: 'e', x: 0.5, y: 0, cursor: 'ew-resize' },
  { id: 'se', x: 0.5, y: 0.5, cursor: 'nwse-resize' },
  { id: 's', x: 0, y: 0.5, cursor: 'ns-resize' },
  { id: 'sw', x: -0.5, y: 0.5, cursor: 'nesw-resize' },
  { id: 'w', x: -0.5, y: 0, cursor: 'ew-resize' },
]

export function TransformOverlay({ canvasRef, document, assets, dispatch, endHistoryGroup, enabled = true }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [displayWidth, setDisplayWidth] = useState(0)
  const [smartGuides, setSmartGuides] = useState<{ x?: number; y?: number }>({})
  const interactionRef = useRef<Interaction | null>(null)
  const canvas = canvasRef.current
  const context = canvas?.getContext('2d') ?? null
  const selectedLayers = document.layers.filter((layer) => document.selectedLayerIds.includes(layer.id) && layerIsVisible(document, layer))
  const activeLayer = document.layers.find((layer) => layer.id === document.selectedLayerId) ?? null
  const activeBounds = canvas && context && activeLayer ? getLayerBounds(context, canvas, activeLayer, assets) : null
  const selectedBounds = useMemo(() => {
    if (!canvas || !context) return []
    return selectedLayers.flatMap((layer) => {
      const bounds = getLayerBounds(context, canvas, layer, assets)
      return bounds ? [{ layer, bounds }] : []
    })
  }, [assets, canvas, context, selectedLayers])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const measure = () => setDisplayWidth(svg.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  const point = (event: ReactPointerEvent<SVGSVGElement | SVGRectElement | SVGCircleElement>): Position => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / rect.width * svg.viewBox.baseVal.width, y: (event.clientY - rect.top) / rect.height * svg.viewBox.baseVal.height }
  }

  const capture = (event: ReactPointerEvent<SVGElement>) => {
    try { svgRef.current?.setPointerCapture(event.pointerId) } catch { /* Synthetic browser events do not expose pointer capture. */ }
  }

  const startResize = (event: ReactPointerEvent<SVGRectElement>, handle: ResizeHandle) => {
    if (!activeLayer || !activeBounds || layerIsLocked(document, activeLayer) || !canvas) return
    event.stopPropagation()
    const cornerIndex = ({ nw: 0, ne: 1, se: 2, sw: 3 } as Partial<Record<ResizeHandle, number>>)[handle]
    if (cornerIndex !== undefined && (event.ctrlKey || event.metaKey)) {
      interactionRef.current = { mode: 'distort', pointerId: event.pointerId, layerId: activeLayer.id, bounds: activeBounds, cornerIndex, source: normalizeGeometryTransform(activeLayer.geometryTransform), perspective: event.shiftKey }
      capture(event)
      return
    }
    interactionRef.current = {
      mode: 'resize', pointerId: event.pointerId,
      snapshot: { layer: activeLayer, bounds: activeBounds, handle, canvasWidth: canvas.width, canvasHeight: canvas.height },
    }
    capture(event)
  }

  const startRotate = (event: ReactPointerEvent<SVGCircleElement>) => {
    if (!activeLayer || !activeBounds || layerIsLocked(document, activeLayer)) return
    event.stopPropagation()
    const cursor = point(event)
    const centerX = activeBounds.x + activeBounds.width / 2
    const centerY = activeBounds.y + activeBounds.height / 2
    const pointerAngle = Math.atan2(cursor.y - centerY, cursor.x - centerX) * 180 / Math.PI
    interactionRef.current = { mode: 'rotate', pointerId: event.pointerId, layerId: activeLayer.id, bounds: activeBounds, pointerOffset: pointerAngle - activeLayer.rotation }
    capture(event)
  }

  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!canvas || !context) return
    const cursor = point(event)
    const layer = findLayerAtPoint(context, canvas, document, assets, cursor)
    const additive = event.shiftKey || event.metaKey || event.ctrlKey
    if (additive) {
      dispatch({ type: 'select-layer', id: layer?.id ?? null, mode: 'toggle' }, { record: false })
      return
    }
    if (!layer) {
      dispatch({ type: 'select-layer', id: null }, { record: false })
      return
    }
    const movingIds = document.selectedLayerIds.includes(layer.id) ? document.selectedLayerIds : [layer.id]
    if (!document.selectedLayerIds.includes(layer.id)) dispatch({ type: 'select-layer', id: layer.id }, { record: false })
    const layers = document.layers
      .filter((candidate) => movingIds.includes(candidate.id) && !layerIsLocked(document, candidate))
      .map((candidate) => ({ id: candidate.id, position: candidate.position }))
    if (layers.length === 0) return
    const movingBounds = selectedBounds.filter(({ layer: candidate }) => movingIds.includes(candidate.id)).map(({ bounds }) => bounds)
    const bounds = movingBounds.reduce<SnapBounds>((result, candidate) => ({ x: Math.min(result.x, candidate.x), y: Math.min(result.y, candidate.y), width: Math.max(result.x + result.width, candidate.x + candidate.width) - Math.min(result.x, candidate.x), height: Math.max(result.y + result.height, candidate.y + candidate.height) - Math.min(result.y, candidate.y) }), movingBounds[0] ?? { x: 0, y: 0, width: 0, height: 0 })
    interactionRef.current = { mode: 'move', pointerId: event.pointerId, start: cursor, bounds, layers }
    setSmartGuides({})
    capture(event)
  }

  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const interaction = interactionRef.current
    if (!interaction || interaction.pointerId !== event.pointerId || !canvas) return
    const cursor = point(event)
    if (interaction.mode === 'move') {
      let pixelDx = cursor.x - interaction.start.x
      let pixelDy = cursor.y - interaction.start.y
      if (document.grid?.snap !== false && context) {
        const movingIds = new Set(interaction.layers.map((layer) => layer.id))
        const otherBounds = document.layers.filter((layer) => !movingIds.has(layer.id) && layerIsVisible(document, layer)).flatMap((layer) => {
          const bounds = getLayerBounds(context, canvas, layer, assets)
          return bounds ? [bounds] : []
        })
        const snapped = snapTranslation(
          interaction.bounds,
          pixelDx,
          pixelDy,
          [0, canvas.width / 2, canvas.width, ...(document.guides ?? []).filter((guide) => guide.direction === 'vertical').map((guide) => guide.position), ...otherBounds.flatMap((bounds) => [bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width])],
          [0, canvas.height / 2, canvas.height, ...(document.guides ?? []).filter((guide) => guide.direction === 'horizontal').map((guide) => guide.position), ...otherBounds.flatMap((bounds) => [bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height])],
          document.grid?.visible ? document.grid.spacing / Math.max(1, document.grid.subdivisions) : undefined,
          Math.max(3, canvas.width / Math.max(1, displayWidth) * 7),
        )
        pixelDx = snapped.dx
        pixelDy = snapped.dy
        setSmartGuides({ x: snapped.xGuide, y: snapped.yGuide })
      }
      const dx = pixelDx / canvas.width
      const dy = pixelDy / canvas.height
      dispatch({ type: 'update-layers', changes: interaction.layers.map((layer) => ({ id: layer.id, patch: { position: { x: layer.position.x + dx, y: layer.position.y + dy } } })) }, { groupKey: 'move-selection' })
    } else if (interaction.mode === 'resize') {
      dispatch({ type: 'update-layer', id: interaction.snapshot.layer.id, patch: calculateLayerResize(interaction.snapshot, cursor, { fromCenter: event.altKey, preserveAspect: event.shiftKey }) }, { groupKey: `resize-${interaction.snapshot.layer.id}` })
    } else if (interaction.mode === 'rotate') {
      dispatch({ type: 'update-layer', id: interaction.layerId, patch: { rotation: calculateRotation(interaction.bounds, cursor, interaction.pointerOffset) } }, { groupKey: `rotate-${interaction.layerId}` })
    } else {
      const bounds = interaction.bounds
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      const angle = -bounds.rotation * Math.PI / 180
      const dx = cursor.x - center.x
      const dy = cursor.y - center.y
      const normalized = { x: 0.5 + (dx * Math.cos(angle) - dy * Math.sin(angle)) / bounds.width, y: 0.5 + (dx * Math.sin(angle) + dy * Math.cos(angle)) / bounds.height }
      const base = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }][interaction.cornerIndex]
      const corners = structuredClone(interaction.source.corners)
      corners[interaction.cornerIndex] = { x: normalized.x - base.x, y: normalized.y - base.y }
      if (interaction.perspective) {
        const adjacent = interaction.cornerIndex === 0 ? 3 : interaction.cornerIndex === 1 ? 2 : interaction.cornerIndex === 2 ? 1 : 0
        corners[adjacent] = { ...corners[adjacent], x: corners[interaction.cornerIndex].x }
      }
      dispatch({ type: 'update-layer', id: interaction.layerId, patch: { geometryTransform: { ...interaction.source, corners } } }, { groupKey: `distort-${interaction.layerId}` })
    }
  }

  const pointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (interactionRef.current?.pointerId !== event.pointerId) return
    interactionRef.current = null
    setSmartGuides({})
    endHistoryGroup()
  }

  const canvasWidth = canvas?.width ?? 1600
  const targetHandlePixels = displayWidth > 0 && displayWidth < 500 ? 18 : 12
  const handleSize = displayWidth > 0 ? Math.max(18, Math.min(96, targetHandlePixels * canvasWidth / displayWidth)) : canvasWidth / 70
  const rotationOffset = handleSize * 3.2

  return (
    <svg
      ref={svgRef}
      aria-label="Transform overlay"
      viewBox={`0 0 ${canvas?.width ?? 1600} ${canvas?.height ?? 1000}`}
      preserveAspectRatio="none"
      className={`absolute inset-0 size-full touch-none overflow-visible ${enabled ? '' : 'pointer-events-none'}`}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
    >
      {smartGuides.x !== undefined && <line x1={smartGuides.x} x2={smartGuides.x} y1="0" y2={canvas?.height ?? 1000} stroke="#f472b6" strokeWidth="1" strokeDasharray="7 4" vectorEffect="non-scaling-stroke" className="pointer-events-none" />}
      {smartGuides.y !== undefined && <line x1="0" x2={canvas?.width ?? 1600} y1={smartGuides.y} y2={smartGuides.y} stroke="#f472b6" strokeWidth="1" strokeDasharray="7 4" vectorEffect="non-scaling-stroke" className="pointer-events-none" />}
      {selectedBounds.map(({ layer, bounds }) => {
        const active = layer.id === document.selectedLayerId
        const centerX = bounds.x + bounds.width / 2
        const centerY = bounds.y + bounds.height / 2
        return (
          <g key={layer.id} transform={`translate(${centerX} ${centerY}) rotate(${bounds.rotation})`} className="pointer-events-none">
            <rect x={-bounds.width / 2} y={-bounds.height / 2} width={bounds.width} height={bounds.height} fill="none" stroke={active ? '#a78bfa' : '#8b5cf6'} strokeWidth={active ? 3 : 2} strokeDasharray={active ? undefined : '10 8'} vectorEffect="non-scaling-stroke" />
          </g>
        )
      })}

      {enabled && activeLayer && activeBounds && !layerIsLocked(document, activeLayer) && (
        <g transform={`translate(${activeBounds.x + activeBounds.width / 2} ${activeBounds.y + activeBounds.height / 2}) rotate(${activeBounds.rotation})`}>
          <line x1="0" y1={-activeBounds.height / 2} x2="0" y2={-activeBounds.height / 2 - rotationOffset} stroke="#a78bfa" strokeWidth="2" vectorEffect="non-scaling-stroke" className="pointer-events-none" />
          <circle cx="0" cy={-activeBounds.height / 2 - rotationOffset} r={handleSize * 0.55} fill="#18181b" stroke="#c4b5fd" strokeWidth="2" vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={startRotate} />
          {handles.map((handle) => (
            <rect
              key={handle.id}
              x={activeBounds.width * handle.x - handleSize / 2}
              y={activeBounds.height * handle.y - handleSize / 2}
              width={handleSize}
              height={handleSize}
              rx={handleSize * 0.16}
              fill="#fafafa"
              stroke="#7c3aed"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              style={{ cursor: handle.cursor }}
              onPointerDown={(event) => startResize(event, handle.id)}
            />
          ))}
        </g>
      )}
    </svg>
  )
}
