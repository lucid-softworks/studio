import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { findLayerAtPoint, getLayerBounds, type LayerBounds, type ResizeHandle } from '../editor/renderer'
import { canvas2dCompositionRenderer } from '../editor/rendering/composition-renderer'
import { layerIsLocked, layerIsVisible } from '../editor/stack'
import { calculateLayerResize, calculateRotation, normalizeGeometryTransform, type TransformResizeSnapshot } from '../editor/transform'
import type { AssetMap } from '../editor/runtime-assets'
import type { EditorDispatch, EditorDocument, LayerPatch, Position } from '../editor/types'
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
  | { mode: 'move'; pointerId: number; start: Position; bounds: SnapBounds; layers: Array<{ id: string; position: Position }>; xTargets: number[]; yTargets: number[]; gridSpacing?: number; lastDx: number; lastDy: number }
  | { mode: 'resize'; pointerId: number; snapshot: TransformResizeSnapshot; lastPatch: LayerPatch }
  | { mode: 'rotate'; pointerId: number; layerId: string; layer: Exclude<EditorDocument['layers'][number], { type: 'adjustment' }>; bounds: LayerBounds; pointerOffset: number; lastRotation: number }
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
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const movingSelectionRef = useRef<SVGGElement>(null)
  const xGuideRef = useRef<SVGLineElement>(null)
  const yGuideRef = useRef<SVGLineElement>(null)
  const previewCleanupRef = useRef<(() => void) | null>(null)
  const [displayWidth, setDisplayWidth] = useState(0)
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

  useEffect(() => () => previewCleanupRef.current?.(), [])

  const point = (event: ReactPointerEvent<SVGSVGElement | SVGRectElement | SVGCircleElement>): Position => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / rect.width * svg.viewBox.baseVal.width, y: (event.clientY - rect.top) / rect.height * svg.viewBox.baseVal.height }
  }

  const capture = (event: ReactPointerEvent<SVGElement>) => {
    try { svgRef.current?.setPointerCapture(event.pointerId) } catch { /* Synthetic browser events do not expose pointer capture. */ }
  }

  const updateSmartGuides = (x?: number, y?: number) => {
    const xGuide = xGuideRef.current
    const yGuide = yGuideRef.current
    if (xGuide) {
      xGuide.style.display = x === undefined ? 'none' : 'block'
      if (x !== undefined) { xGuide.setAttribute('x1', String(x)); xGuide.setAttribute('x2', String(x)) }
    }
    if (yGuide) {
      yGuide.style.display = y === undefined ? 'none' : 'block'
      if (y !== undefined) { yGuide.setAttribute('y1', String(y)); yGuide.setAttribute('y2', String(y)) }
    }
  }

  const prepareMovePreview = (movingIds: string[]) => {
    const preview = previewCanvasRef.current
    if (!canvas || !preview) return
    previewCleanupRef.current?.()
    const ids = new Set(movingIds)
    const previewDocument: EditorDocument = {
      ...document,
      background: { ...document.background, kind: 'transparent', imageAssetId: null },
      pattern: { ...document.pattern, kind: 'none' },
      layers: document.layers.map((layer) => ids.has(layer.id) ? layer : { ...layer, visible: false }),
      selectedLayerId: null,
      selectedLayerIds: [],
      selectedGroupId: null,
    }
    const baseDocument: EditorDocument = {
      ...document,
      layers: document.layers.map((layer) => ids.has(layer.id) ? { ...layer, visible: false } : layer),
      selectedLayerId: null,
      selectedLayerIds: [],
      selectedGroupId: null,
    }
    canvas2dCompositionRenderer.render(preview, previewDocument, assets)
    preview.style.display = 'block'
    preview.style.transform = 'translate3d(0, 0, 0)'
    canvas2dCompositionRenderer.render(canvas, baseDocument, assets)
  }

  const applyLiveTransform = (from: LayerBounds, to: LayerBounds, axisRotation: number, rotationDelta = 0) => {
    if (!canvas) return
    const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
    const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
    const dx = toCenter.x - fromCenter.x
    const dy = toCenter.y - fromCenter.y
    const scaleX = to.width / Math.max(0.0001, from.width)
    const scaleY = to.height / Math.max(0.0001, from.height)
    const transform = rotationDelta
      ? `translate(${dx / canvas.width * 100}%, ${dy / canvas.height * 100}%) rotate(${rotationDelta}deg)`
      : `translate(${dx / canvas.width * 100}%, ${dy / canvas.height * 100}%) rotate(${axisRotation}deg) scale(${scaleX}, ${scaleY}) rotate(${-axisRotation}deg)`
    const preview = previewCanvasRef.current
    if (preview) {
      preview.style.transformOrigin = `${fromCenter.x / canvas.width * 100}% ${fromCenter.y / canvas.height * 100}%`
      preview.style.transform = transform
    }
    const group = movingSelectionRef.current
    if (group) {
      const inner = rotationDelta
        ? `rotate(${rotationDelta} ${fromCenter.x} ${fromCenter.y})`
        : `translate(${fromCenter.x} ${fromCenter.y}) rotate(${axisRotation}) scale(${scaleX} ${scaleY}) rotate(${-axisRotation}) translate(${-fromCenter.x} ${-fromCenter.y})`
      group.setAttribute('transform', `translate(${dx} ${dy}) ${inner}`)
    }
  }

  const schedulePreviewCleanup = () => {
    if (!canvas) return
    const preview = previewCanvasRef.current
    const cleanup = () => {
      canvas.removeEventListener('studio:canvas-rendered', rendered)
      window.clearTimeout(timeout)
      if (preview) { preview.style.display = 'none'; preview.style.transform = 'none'; preview.width = 1; preview.height = 1 }
      if (movingSelectionRef.current) movingSelectionRef.current.removeAttribute('transform')
      previewCleanupRef.current = null
    }
    const rendered = () => cleanup()
    const timeout = window.setTimeout(cleanup, 2_000)
    canvas.addEventListener('studio:canvas-rendered', rendered, { once: true })
    previewCleanupRef.current = cleanup
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
      lastPatch: {},
    }
    prepareMovePreview([activeLayer.id])
    capture(event)
  }

  const startRotate = (event: ReactPointerEvent<SVGCircleElement>) => {
    if (!activeLayer || !activeBounds || layerIsLocked(document, activeLayer)) return
    event.stopPropagation()
    const cursor = point(event)
    const centerX = activeBounds.x + activeBounds.width / 2
    const centerY = activeBounds.y + activeBounds.height / 2
    const pointerAngle = Math.atan2(cursor.y - centerY, cursor.x - centerX) * 180 / Math.PI
    if (activeLayer.type === 'adjustment') return
    interactionRef.current = { mode: 'rotate', pointerId: event.pointerId, layerId: activeLayer.id, layer: activeLayer, bounds: activeBounds, pointerOffset: pointerAngle - activeLayer.rotation, lastRotation: activeLayer.rotation }
    prepareMovePreview([activeLayer.id])
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
    const movingIdSet = new Set(movingIds)
    const movingBounds = document.layers.filter((candidate) => movingIdSet.has(candidate.id)).flatMap((candidate) => {
      const candidateBounds = getLayerBounds(context, canvas, candidate, assets)
      return candidateBounds ? [candidateBounds] : []
    })
    const bounds = movingBounds.reduce<SnapBounds>((result, candidate) => ({ x: Math.min(result.x, candidate.x), y: Math.min(result.y, candidate.y), width: Math.max(result.x + result.width, candidate.x + candidate.width) - Math.min(result.x, candidate.x), height: Math.max(result.y + result.height, candidate.y + candidate.height) - Math.min(result.y, candidate.y) }), movingBounds[0] ?? { x: 0, y: 0, width: 0, height: 0 })
    const otherBounds = document.layers.filter((candidate) => !movingIdSet.has(candidate.id) && layerIsVisible(document, candidate)).flatMap((candidate) => {
      const candidateBounds = getLayerBounds(context, canvas, candidate, assets)
      return candidateBounds ? [candidateBounds] : []
    })
    interactionRef.current = {
      mode: 'move', pointerId: event.pointerId, start: cursor, bounds, layers,
      xTargets: [0, canvas.width / 2, canvas.width, ...(document.guides ?? []).filter((guide) => guide.direction === 'vertical').map((guide) => guide.position), ...otherBounds.flatMap((candidate) => [candidate.x, candidate.x + candidate.width / 2, candidate.x + candidate.width])],
      yTargets: [0, canvas.height / 2, canvas.height, ...(document.guides ?? []).filter((guide) => guide.direction === 'horizontal').map((guide) => guide.position), ...otherBounds.flatMap((candidate) => [candidate.y, candidate.y + candidate.height / 2, candidate.y + candidate.height])],
      gridSpacing: document.grid?.visible ? document.grid.spacing / Math.max(1, document.grid.subdivisions) : undefined,
      lastDx: 0,
      lastDy: 0,
    }
    updateSmartGuides()
    prepareMovePreview(layers.map((candidate) => candidate.id))
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
        const snapped = snapTranslation(
          interaction.bounds,
          pixelDx,
          pixelDy,
          interaction.xTargets,
          interaction.yTargets,
          interaction.gridSpacing,
          Math.max(3, canvas.width / Math.max(1, displayWidth) * 7),
        )
        pixelDx = snapped.dx
        pixelDy = snapped.dy
        updateSmartGuides(snapped.xGuide, snapped.yGuide)
      }
      interaction.lastDx = pixelDx
      interaction.lastDy = pixelDy
      const transform = `translate(${pixelDx / canvas.width * 100}% , ${pixelDy / canvas.height * 100}%)`
      if (previewCanvasRef.current) previewCanvasRef.current.style.transform = transform
      movingSelectionRef.current?.setAttribute('transform', `translate(${pixelDx} ${pixelDy})`)
    } else if (interaction.mode === 'resize') {
      const patch = calculateLayerResize(interaction.snapshot, cursor, { fromCenter: event.altKey, preserveAspect: event.shiftKey })
      interaction.lastPatch = patch
      const previewLayer = { ...interaction.snapshot.layer, ...patch } as EditorDocument['layers'][number]
      const bounds = context ? getLayerBounds(context, canvas, previewLayer, assets) : null
      if (bounds) applyLiveTransform(interaction.snapshot.bounds, bounds, interaction.snapshot.bounds.rotation)
    } else if (interaction.mode === 'rotate') {
      interaction.lastRotation = calculateRotation(interaction.bounds, cursor, interaction.pointerOffset)
      applyLiveTransform(interaction.bounds, interaction.bounds, 0, interaction.lastRotation - interaction.layer.rotation)
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
    const interaction = interactionRef.current
    if (interaction?.pointerId !== event.pointerId) return
    interactionRef.current = null
    updateSmartGuides()
    if (interaction.mode === 'move') {
      const dx = interaction.lastDx / (canvas?.width ?? 1)
      const dy = interaction.lastDy / (canvas?.height ?? 1)
      if (interaction.lastDx === 0 && interaction.lastDy === 0) {
        if (canvas) canvas2dCompositionRenderer.render(canvas, document, assets)
        previewCleanupRef.current?.()
      } else {
        dispatch({ type: 'update-layers', changes: interaction.layers.map((layer) => ({ id: layer.id, patch: { position: { x: layer.position.x + dx, y: layer.position.y + dy } } })) })
        schedulePreviewCleanup()
      }
    } else if (interaction.mode === 'resize') {
      if (Object.keys(interaction.lastPatch).length === 0) {
        if (canvas) canvas2dCompositionRenderer.render(canvas, document, assets)
        previewCleanupRef.current?.()
      } else {
        dispatch({ type: 'update-layer', id: interaction.snapshot.layer.id, patch: interaction.lastPatch })
        schedulePreviewCleanup()
      }
    } else if (interaction.mode === 'rotate') {
      if (interaction.lastRotation === interaction.layer.rotation) {
        if (canvas) canvas2dCompositionRenderer.render(canvas, document, assets)
        previewCleanupRef.current?.()
      } else {
        dispatch({ type: 'update-layer', id: interaction.layerId, patch: { rotation: interaction.lastRotation } })
        schedulePreviewCleanup()
      }
    }
    endHistoryGroup()
  }

  const canvasWidth = canvas?.width ?? 1600
  const targetHandlePixels = displayWidth > 0 && displayWidth < 500 ? 18 : 12
  const handleSize = displayWidth > 0 ? Math.max(18, Math.min(96, targetHandlePixels * canvasWidth / displayWidth)) : canvasWidth / 70
  const rotationOffset = handleSize * 3.2

  return (
    <Fragment>
    <canvas ref={previewCanvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 hidden size-full will-change-transform" />
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
      <line ref={xGuideRef} x1="0" x2="0" y1="0" y2={canvas?.height ?? 1000} stroke="#f472b6" strokeWidth="1" strokeDasharray="7 4" vectorEffect="non-scaling-stroke" className="pointer-events-none hidden" />
      <line ref={yGuideRef} x1="0" x2={canvas?.width ?? 1600} y1="0" y2="0" stroke="#f472b6" strokeWidth="1" strokeDasharray="7 4" vectorEffect="non-scaling-stroke" className="pointer-events-none hidden" />
      <g ref={movingSelectionRef}>
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
      </g>
    </svg>
    </Fragment>
  )
}
