import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { getLayerBounds } from '../editor/renderer'
import type { AssetMap } from '../editor/runtime-assets'
import { geometryMesh, normalizeGeometryTransform } from '../editor/transform'
import { createId } from '../editor/presets'
import type { EditorDispatch, EditorDocument, Position } from '../editor/types'

type Props = { canvasRef: RefObject<HTMLCanvasElement | null>; document: EditorDocument; assets: AssetMap; dispatch: EditorDispatch; endHistoryGroup: () => void; mode: 'warp' | 'puppet'; enabled: boolean }
type Drag = { pointerId: number; index: number; source: ReturnType<typeof normalizeGeometryTransform> }

export function WarpOverlay({ canvasRef, document, assets, dispatch, endHistoryGroup, mode, enabled }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [selectedPin, setSelectedPin] = useState<number | null>(null)
  const canvas = canvasRef.current
  const context = canvas?.getContext('2d')
  const layer = document.layers.find((candidate) => candidate.id === document.selectedLayerId && candidate.type !== 'adjustment')
  const bounds = canvas && context && layer ? getLayerBounds(context, canvas, layer, assets) : null
  const geometry = normalizeGeometryTransform(layer?.geometryTransform)
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
  const update = (next: typeof geometry, continuous = false) => {
    if (layer) dispatch({ type: 'update-layer', id: layer.id, patch: { geometryTransform: next } }, continuous ? { groupKey: `${mode}-geometry-${layer.id}` } : undefined)
  }
  const downHandle = (event: ReactPointerEvent<SVGCircleElement>, index: number) => {
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = { pointerId: event.pointerId, index, source: structuredClone(geometry) }
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
    const position = local(pointer(event))
    if (mode === 'warp') {
      const warp = drag.source.warp ?? { columns: 3, rows: 3, points: Array.from({ length: 9 }, (_, index) => ({ x: index % 3 / 2, y: Math.floor(index / 3) / 2 })) }
      const points = structuredClone(warp.points)
      points[drag.index] = position
      update({ ...drag.source, warp: { ...warp, points } }, true)
    } else {
      const puppetPins = structuredClone(drag.source.puppetPins ?? [])
      if (puppetPins[drag.index]) puppetPins[drag.index].position = position
      update({ ...drag.source, puppetPins }, true)
    }
  }
  const end = () => { if (dragRef.current) { dragRef.current = null; endHistoryGroup() } }

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (!enabled || mode !== 'puppet' || selectedPin === null || !layer || (event.key !== 'Delete' && event.key !== 'Backspace')) return
      update({ ...geometry, puppetPins: (geometry.puppetPins ?? []).filter((_, index) => index !== selectedPin) })
      setSelectedPin(null)
      event.preventDefault()
    }
    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  })

  const warpPoints = (geometry.warp ? geometryMesh(geometry).destination : geometryMesh({ ...geometry, warp: { columns: 3, rows: 3, points: Array.from({ length: 9 }, (_, index) => ({ x: index % 3 / 2, y: Math.floor(index / 3) / 2 })) } }).destination).map(world)
  return <svg ref={svgRef} aria-label={enabled ? `${mode} editing surface` : undefined} viewBox={`0 0 ${canvas?.width ?? 1600} ${canvas?.height ?? 1000}`} preserveAspectRatio="none" className={`absolute inset-0 size-full touch-none ${enabled ? '' : 'pointer-events-none'}`} onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    {enabled && bounds && mode === 'warp' && <>{Array.from({ length: 3 }, (_, row) => <polyline key={`r${row}`} points={warpPoints.slice(row * 3, row * 3 + 3).map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#22d3ee" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}{Array.from({ length: 3 }, (_, column) => <polyline key={`c${column}`} points={[0, 1, 2].map((row) => warpPoints[row * 3 + column]).map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#22d3ee" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}{warpPoints.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="6" fill="#111113" stroke="#67e8f9" strokeWidth="2" vectorEffect="non-scaling-stroke" onPointerDown={(event) => downHandle(event, index)} />)}</>}
    {enabled && bounds && mode === 'puppet' && <>{(geometry.puppetPins ?? []).map((pin, index) => { const point = world(pin.position); return <circle key={pin.id} cx={point.x} cy={point.y} r="8" fill={selectedPin === index ? '#f59e0b' : '#111113'} stroke="#fbbf24" strokeWidth="2" vectorEffect="non-scaling-stroke" onPointerDown={(event) => downHandle(event, index)} /> })}<path d={`M${world({ x: 0, y: 0 }).x} ${world({ x: 0, y: 0 }).y}L${world({ x: 1, y: 0 }).x} ${world({ x: 1, y: 0 }).y}L${world({ x: 1, y: 1 }).x} ${world({ x: 1, y: 1 }).y}L${world({ x: 0, y: 1 }).x} ${world({ x: 0, y: 1 }).y}Z`} fill="none" stroke="#fbbf24" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" className="pointer-events-none" /></>}
  </svg>
}
