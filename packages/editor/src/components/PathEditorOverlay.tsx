import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { createId } from '../editor/presets'
import type { DocumentPath, EditorDispatch, EditorDocument, Position, VectorPath } from '../editor/types'
import { axisConstrainedPosition } from '../editor/transform'

type PathTool = 'pen' | 'direct-select' | 'path-select'
type DragTarget = { pointerId: number; pathIndex: number; knotIndex?: number; handle?: 'in' | 'out'; start: Position; source: DocumentPath; draft: DocumentPath }

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  document: EditorDocument
  dispatch: EditorDispatch
  tool: PathTool
  enabled: boolean
}

const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y)
const normalizedPointerPoint = (event: ReactPointerEvent<SVGSVGElement | SVGCircleElement | SVGPathElement>) => {
  const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect()
  return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }
}
const pathData = (path: VectorPath, width: number, height: number) => {
  const point = (value: Position) => `${value.x * width} ${value.y * height}`
  const first = path.knots[0]
  if (!first) return ''
  let data = `M ${point(first.anchor)}`
  for (let index = 1; index < path.knots.length; index += 1) {
    const previous = path.knots[index - 1]
    const current = path.knots[index]
    data += ` C ${point(previous.out)}, ${point(current.in)}, ${point(current.anchor)}`
  }
  if (path.closed) {
    const previous = path.knots.at(-1)!
    data += ` C ${point(previous.out)}, ${point(first.in)}, ${point(first.anchor)} Z`
  }
  return data
}

export function PathEditorOverlay({ canvasRef, document, dispatch, tool, enabled }: Props) {
  const [selected, setSelected] = useState<{ pathIndex: number; knotIndex?: number } | null>(null)
  const [preview, setPreview] = useState<DocumentPath | null>(null)
  const dragRef = useRef<DragTarget | null>(null)
  const active = document.paths?.find((path) => path.id === document.selectedPathId) ?? document.paths?.at(-1)
  const visiblePath = preview ?? active
  const width = canvasRef.current?.width ?? document.canvasSize.width
  const height = canvasRef.current?.height ?? document.canvasSize.height

  const update = (path: DocumentPath) => {
    const exists = (document.paths ?? []).some((candidate) => candidate.id === path.id)
    const paths = exists ? (document.paths ?? []).map((candidate) => candidate.id === path.id ? path : candidate) : [...(document.paths ?? []), path]
    dispatch({ type: 'set-paths', paths, selectedPathId: path.id })
  }

  const penDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!enabled || tool !== 'pen') return
    event.preventDefault()
    const point = normalizedPointerPoint(event)
    const source: DocumentPath = active ? structuredClone(active) : { id: createId(), name: 'Work Path', kind: 'work', paths: [] }
    let pathIndex = source.paths.findIndex((path) => !path.closed)
    if (pathIndex < 0) {
      source.paths.push({ closed: false, operation: 'combine', fillRule: 'non-zero', knots: [] })
      pathIndex = source.paths.length - 1
    }
    const path = source.paths[pathIndex]
    if (path.knots.length >= 3 && distance(path.knots[0].anchor, point) < 0.025) {
      path.closed = true
      update(source)
      setSelected({ pathIndex, knotIndex: 0 })
      return
    }
    const knot = { linked: true, in: point, anchor: point, out: point }
    path.knots.push(knot)
    const knotIndex = path.knots.length - 1
    dragRef.current = { pointerId: event.pointerId, pathIndex, knotIndex, start: point, source, draft: source }
    event.currentTarget.setPointerCapture(event.pointerId)
    setPreview(source)
    setSelected({ pathIndex, knotIndex })
  }

  const startDrag = (event: ReactPointerEvent<SVGCircleElement | SVGPathElement>, pathIndex: number, knotIndex?: number, handle?: 'in' | 'out') => {
    if (!active || !enabled || tool === 'pen') return
    event.preventDefault()
    event.stopPropagation()
    const start = normalizedPointerPoint(event)
    const source = structuredClone(active)
    if (tool === 'direct-select' && knotIndex !== undefined && !handle && event.altKey) {
      const knot = source.paths[pathIndex].knots[knotIndex]
      const collapsed = distance(knot.in, knot.anchor) > 0.001 || distance(knot.out, knot.anchor) > 0.001
      knot.linked = !collapsed
      knot.in = collapsed ? { ...knot.anchor } : { x: knot.anchor.x - 0.035, y: knot.anchor.y }
      knot.out = collapsed ? { ...knot.anchor } : { x: knot.anchor.x + 0.035, y: knot.anchor.y }
      update(source)
      setSelected({ pathIndex, knotIndex })
      return
    }
    dragRef.current = { pointerId: event.pointerId, pathIndex, knotIndex: tool === 'path-select' ? undefined : knotIndex, handle, start, source, draft: source }
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelected({ pathIndex, knotIndex: tool === 'path-select' ? undefined : knotIndex })
  }

  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const point = axisConstrainedPosition(drag.start, normalizedPointerPoint(event), event.shiftKey)
    const source = structuredClone(drag.source)
    const dx = point.x - drag.start.x
    const dy = point.y - drag.start.y
    const path = source.paths[drag.pathIndex]
    if (drag.knotIndex === undefined) {
      for (const knot of path.knots) for (const key of ['in', 'anchor', 'out'] as const) knot[key] = { x: knot[key].x + dx, y: knot[key].y + dy }
    } else {
      const knot = path.knots[drag.knotIndex]
      if (drag.handle) {
        knot[drag.handle] = point
        if (event.altKey) knot.linked = false
        else if (knot.linked) {
          const opposite = drag.handle === 'in' ? 'out' : 'in'
          knot[opposite] = { x: knot.anchor.x * 2 - point.x, y: knot.anchor.y * 2 - point.y }
        }
      } else if (tool === 'pen') {
        knot.out = point
        if (event.altKey) knot.linked = false
        else knot.in = { x: knot.anchor.x * 2 - point.x, y: knot.anchor.y * 2 - point.y }
      } else {
        for (const key of ['in', 'anchor', 'out'] as const) knot[key] = { x: knot[key].x + dx, y: knot[key].y + dy }
      }
    }
    drag.draft = source
    setPreview(source)
  }

  const finish = () => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    setPreview(null)
    update(drag.draft)
  }

  const cancel = () => {
    if (!dragRef.current) return
    dragRef.current = null
    setPreview(null)
  }

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragRef.current) {
        event.preventDefault()
        event.stopImmediatePropagation()
        cancel()
        return
      }
      if (!enabled || tool !== 'direct-select' || !active || selected?.knotIndex === undefined || (event.key !== 'Backspace' && event.key !== 'Delete')) return
      const source = structuredClone(active)
      const path = source.paths[selected.pathIndex]
      path.knots.splice(selected.knotIndex, 1)
      if (!path.knots.length) source.paths.splice(selected.pathIndex, 1)
      update(source)
      setSelected(null)
      event.preventDefault()
    }
    window.addEventListener('keydown', keyDown, true)
    return () => window.removeEventListener('keydown', keyDown, true)
  })

  return (
    <svg aria-label={enabled ? `${tool} path editing surface` : undefined} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={`absolute inset-0 size-full touch-none ${enabled ? '' : 'pointer-events-none'}`} style={{ cursor: tool === 'pen' ? 'crosshair' : 'default' }} onPointerDown={penDown} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel}>
      {visiblePath?.paths.map((path, pathIndex) => <g key={pathIndex}>
        <path d={pathData(path, width, height)} fill="none" stroke="#38bdf8" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className={tool === 'path-select' ? 'pointer-events-auto' : 'pointer-events-none'} onPointerDown={(event) => startDrag(event, pathIndex)} />
        {(tool === 'direct-select' || tool === 'pen') && path.knots.map((knot, knotIndex) => <g key={knotIndex}>
          {(selected?.pathIndex === pathIndex && selected.knotIndex === knotIndex) && <><line x1={knot.in.x * width} y1={knot.in.y * height} x2={knot.out.x * width} y2={knot.out.y * height} stroke="#7dd3fc" strokeWidth={1} vectorEffect="non-scaling-stroke" /><circle cx={knot.in.x * width} cy={knot.in.y * height} r={4} fill="#111113" stroke="#7dd3fc" strokeWidth={1.5} vectorEffect="non-scaling-stroke" onPointerDown={(event) => startDrag(event, pathIndex, knotIndex, 'in')} /><circle cx={knot.out.x * width} cy={knot.out.y * height} r={4} fill="#111113" stroke="#7dd3fc" strokeWidth={1.5} vectorEffect="non-scaling-stroke" onPointerDown={(event) => startDrag(event, pathIndex, knotIndex, 'out')} /></>}
          <circle cx={knot.anchor.x * width} cy={knot.anchor.y * height} r={5} fill={selected?.pathIndex === pathIndex && selected.knotIndex === knotIndex ? '#38bdf8' : '#111113'} stroke="#e0f2fe" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="pointer-events-auto" onPointerDown={(event) => startDrag(event, pathIndex, knotIndex)} />
        </g>)}
      </g>)}
    </svg>
  )
}
