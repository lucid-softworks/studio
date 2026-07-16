import { Fragment, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { getLayerBounds } from '../editor/renderer'
import type { AssetMap } from '../editor/runtime-assets'
import { axisConstrainedPosition, geometryMesh, normalizeGeometryTransform } from '../editor/transform'
import { createId } from '../editor/presets'
import type { EditorDispatch, EditorDocument, Position } from '../editor/types'
import { canvas2dCompositionRenderer } from '../editor/rendering/composition-renderer'

type Props = { canvasRef: RefObject<HTMLCanvasElement | null>; document: EditorDocument; assets: AssetMap; dispatch: EditorDispatch; mode: 'warp' | 'puppet'; enabled: boolean }
type Drag = { pointerId: number; index: number; start: Position; source: ReturnType<typeof normalizeGeometryTransform>; draft: ReturnType<typeof normalizeGeometryTransform>; moved: boolean }

export function WarpOverlay({ canvasRef, document, assets, dispatch, mode, enabled }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const previewFrameRef = useRef(0)
  const previewCleanupRef = useRef<(() => void) | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const [selectedPin, setSelectedPin] = useState<number | null>(null)
  const [draftGeometry, setDraftGeometry] = useState<ReturnType<typeof normalizeGeometryTransform> | null>(null)
  const canvas = canvasRef.current
  const context = canvas?.getContext('2d')
  const layer = document.layers.find((candidate) => candidate.id === document.selectedLayerId && candidate.type !== 'adjustment')
  const bounds = canvas && context && layer ? getLayerBounds(context, canvas, layer, assets) : null
  const geometry = normalizeGeometryTransform(layer?.geometryTransform)
  const visibleGeometry = draftGeometry ?? geometry
  const angle = (bounds?.rotation ?? 0) * Math.PI / 180
  const center = bounds ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } : { x: 0, y: 0 }
  const world = (point: Position) => bounds ? { x: center.x + (point.x - 0.5) * bounds.width * Math.cos(angle) - (point.y - 0.5) * bounds.height * Math.sin(angle), y: center.y + (point.x - 0.5) * bounds.width * Math.sin(angle) + (point.y - 0.5) * bounds.height * Math.cos(angle) } : point
  const local = (point: Position) => {
    if (!bounds) return { x: 0.5, y: 0.5 }
    const dx = point.x - center.x
    const dy = point.y - center.y
    return { x: 0.5 + (dx * Math.cos(angle) + dy * Math.sin(angle)) / bounds.width, y: 0.5 + (-dx * Math.sin(angle) + dy * Math.cos(angle)) / bounds.height }
  }
  const pointer = (event: ReactPointerEvent<SVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    return rect && canvas ? { x: (event.clientX - rect.left) / rect.width * canvas.width, y: (event.clientY - rect.top) / rect.height * canvas.height } : { x: 0, y: 0 }
  }
  const update = (next: typeof geometry) => {
    if (layer) dispatch({ type: 'update-layer', id: layer.id, patch: { geometryTransform: next } })
  }
  const clearPreview = () => {
    window.cancelAnimationFrame(previewFrameRef.current)
    previewCleanupRef.current?.()
    previewCleanupRef.current = null
  }
  const preparePreview = () => {
    const preview = previewCanvasRef.current
    if (!canvas || !preview || !layer) return
    clearPreview()
    canvas.dispatchEvent(new CustomEvent('studio:transform-preview-start'))
    const baseDocument: EditorDocument = {
      ...document,
      layers: document.layers.map((candidate) => candidate.id === layer.id ? { ...candidate, visible: false } : candidate),
      selectedLayerId: null,
      selectedLayerIds: [],
      selectedGroupId: null,
    }
    canvas2dCompositionRenderer.render(canvas, baseDocument, assets)
    preview.style.display = 'block'
    const cleanup = () => {
      window.cancelAnimationFrame(previewFrameRef.current)
      preview.style.display = 'none'
      preview.style.left = '0'
      preview.style.top = '0'
      preview.style.width = '1px'
      preview.style.height = '1px'
      preview.width = 1
      preview.height = 1
    }
    previewCleanupRef.current = cleanup
  }
  const renderPreview = (next: typeof geometry) => {
    const preview = previewCanvasRef.current
    if (!canvas || !preview || !layer || !bounds) return
    window.cancelAnimationFrame(previewFrameRef.current)
    previewFrameRef.current = window.requestAnimationFrame(() => {
      const points = geometryMesh(next).destination.map(world)
      const margin = Math.max(24, Math.min(bounds.width, bounds.height) * 0.12)
      const left = Math.max(0, Math.floor(Math.min(bounds.x, ...points.map((point) => point.x)) - margin))
      const top = Math.max(0, Math.floor(Math.min(bounds.y, ...points.map((point) => point.y)) - margin))
      const right = Math.min(canvas.width, Math.ceil(Math.max(bounds.x + bounds.width, ...points.map((point) => point.x)) + margin))
      const bottom = Math.min(canvas.height, Math.ceil(Math.max(bounds.y + bounds.height, ...points.map((point) => point.y)) + margin))
      const viewport = { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
      const previewDocument: EditorDocument = {
        ...document,
        background: { ...document.background, kind: 'transparent', imageAssetId: null },
        pattern: { ...document.pattern, kind: 'none' },
        layers: document.layers.map((candidate) => candidate.id === layer.id ? { ...candidate, geometryTransform: next } : { ...candidate, visible: false }),
        selectedLayerId: null,
        selectedLayerIds: [],
        selectedGroupId: null,
      }
      canvas2dCompositionRenderer.render(preview, previewDocument, assets, { viewport })
      preview.style.left = `${viewport.x / canvas.width * 100}%`
      preview.style.top = `${viewport.y / canvas.height * 100}%`
      preview.style.width = `${viewport.width / canvas.width * 100}%`
      preview.style.height = `${viewport.height / canvas.height * 100}%`
    })
  }
  const finishPreview = (commit: boolean) => {
    const preview = previewCanvasRef.current
    if (!canvas) return
    if (!commit) {
      canvas2dCompositionRenderer.render(canvas, document, assets)
      canvas.dispatchEvent(new CustomEvent('studio:transform-preview-end'))
      clearPreview()
      return
    }
    const cleanup = () => {
      canvas.removeEventListener('studio:canvas-rendered', rendered)
      window.clearTimeout(timeout)
      clearPreview()
    }
    const rendered = () => cleanup()
    const timeout = window.setTimeout(cleanup, 2_000)
    canvas.addEventListener('studio:canvas-rendered', rendered, { once: true })
    canvas.dispatchEvent(new CustomEvent('studio:transform-preview-end'))
    if (preview) preview.style.display = 'block'
  }
  const downHandle = (event: ReactPointerEvent<SVGCircleElement>, index: number) => {
    event.preventDefault()
    event.stopPropagation()
    const source = structuredClone(geometry)
    dragRef.current = { pointerId: event.pointerId, index, start: local(pointer(event)), source, draft: source, moved: false }
    setDraftGeometry(source)
    preparePreview()
    renderPreview(source)
    setSelectedPin(mode === 'puppet' ? index : null)
    svgRef.current?.setPointerCapture(event.pointerId)
  }
  const down = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!enabled || !layer || !bounds || mode !== 'puppet') return
    const position = local(pointer(event))
    update({ ...geometry, puppetPins: [...(geometry.puppetPins ?? []), { id: createId(), source: position, position }] })
    setSelectedPin(geometry.puppetPins?.length ?? 0)
  }
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const position = axisConstrainedPosition(drag.start, local(pointer(event)), event.shiftKey)
    if (mode === 'warp') {
      const warp = drag.source.warp ?? { columns: 3, rows: 3, points: Array.from({ length: 9 }, (_, index) => ({ x: index % 3 / 2, y: Math.floor(index / 3) / 2 })) }
      const points = structuredClone(warp.points)
      points[drag.index] = position
      drag.draft = { ...drag.source, warp: { ...warp, points } }
    } else {
      const puppetPins = structuredClone(drag.source.puppetPins ?? [])
      if (puppetPins[drag.index]) puppetPins[drag.index].position = position
      drag.draft = { ...drag.source, puppetPins }
    }
    drag.moved = true
    setDraftGeometry(drag.draft)
    renderPreview(drag.draft)
  }
  const end = () => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    setDraftGeometry(null)
    if (drag.moved) update(drag.draft)
    finishPreview(drag.moved)
  }

  const cancel = () => {
    if (!dragRef.current) return
    dragRef.current = null
    setDraftGeometry(null)
    finishPreview(false)
  }

  useEffect(() => () => clearPreview(), [])

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragRef.current) {
        event.preventDefault()
        event.stopImmediatePropagation()
        cancel()
        return
      }
      if (!enabled || mode !== 'puppet' || selectedPin === null || !layer || (event.key !== 'Delete' && event.key !== 'Backspace')) return
      update({ ...geometry, puppetPins: (geometry.puppetPins ?? []).filter((_, index) => index !== selectedPin) })
      setSelectedPin(null)
      event.preventDefault()
    }
    window.addEventListener('keydown', keyDown, true)
    return () => window.removeEventListener('keydown', keyDown, true)
  })

  const warpPoints = (visibleGeometry.warp ? geometryMesh(visibleGeometry).destination : geometryMesh({ ...visibleGeometry, warp: { columns: 3, rows: 3, points: Array.from({ length: 9 }, (_, index) => ({ x: index % 3 / 2, y: Math.floor(index / 3) / 2 })) } }).destination).map(world)
  return <Fragment><div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden"><canvas ref={previewCanvasRef} data-warp-preview={mode} className="absolute hidden" /></div><svg ref={svgRef} aria-label={enabled ? `${mode} editing surface` : undefined} viewBox={`0 0 ${canvas?.width ?? 1600} ${canvas?.height ?? 1000}`} preserveAspectRatio="none" className={`absolute inset-0 size-full touch-none ${enabled ? '' : 'pointer-events-none'}`} onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel}>
    {enabled && bounds && mode === 'warp' && <>{Array.from({ length: 3 }, (_, row) => <polyline key={`r${row}`} points={warpPoints.slice(row * 3, row * 3 + 3).map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#22d3ee" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}{Array.from({ length: 3 }, (_, column) => <polyline key={`c${column}`} points={[0, 1, 2].map((row) => warpPoints[row * 3 + column]).map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#22d3ee" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}{warpPoints.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="6" fill="#111113" stroke="#67e8f9" strokeWidth="2" vectorEffect="non-scaling-stroke" onPointerDown={(event) => downHandle(event, index)} />)}</>}
    {enabled && bounds && mode === 'puppet' && <>{(visibleGeometry.puppetPins ?? []).map((pin, index) => { const point = world(pin.position); return <circle key={pin.id} cx={point.x} cy={point.y} r="8" fill={selectedPin === index ? '#f59e0b' : '#111113'} stroke="#fbbf24" strokeWidth="2" vectorEffect="non-scaling-stroke" onPointerDown={(event) => downHandle(event, index)} /> })}<path d={`M${world({ x: 0, y: 0 }).x} ${world({ x: 0, y: 0 }).y}L${world({ x: 1, y: 0 }).x} ${world({ x: 1, y: 0 }).y}L${world({ x: 1, y: 1 }).x} ${world({ x: 1, y: 1 }).y}L${world({ x: 0, y: 1 }).x} ${world({ x: 0, y: 1 }).y}Z`} fill="none" stroke="#fbbf24" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" className="pointer-events-none" /></>}
  </svg></Fragment>
}
