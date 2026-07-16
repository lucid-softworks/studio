import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { curvePreset, histogramRange, visibleHistogram, type CurvePreset } from '../editor/curves'
import type { AdjustmentCurve } from '../editor/types'

type Channel = 'rgb' | 'red' | 'green' | 'blue'
type Props = { curves: Partial<Record<Channel, AdjustmentCurve>>; canvasRef: RefObject<HTMLCanvasElement | null>; onChange: (channel: Channel, points: AdjustmentCurve, groupKey?: string) => void; onChangeEnd: () => void }

const channelColor: Record<Channel, string> = { rgb: '#e4e4e7', red: '#fb7185', green: '#4ade80', blue: '#60a5fa' }

export function CurvesControl({ curves, canvasRef, onChange, onChangeEnd }: Props) {
  const [channel, setChannel] = useState<Channel>('rgb')
  const dragIndexRef = useRef<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const points = useMemo(() => (curves[channel] ?? curvePreset('linear')).toSorted((left, right) => left.input - right.input), [channel, curves])
  const canvasRenderRevision = JSON.stringify(curves)
  const histogram = useMemo(() => {
    // Curve edits redraw the shared canvas; this revision invalidates its sampled histogram.
    void canvasRenderRevision
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d', { willReadFrequently: true })
    if (!canvas || !context) return Array.from({ length: 256 }, () => 0)
    try { return visibleHistogram(context.getImageData(0, 0, canvas.width, canvas.height).data, channel) } catch { return Array.from({ length: 256 }, () => 0) }
  }, [canvasRef, canvasRenderRevision, channel])

  const curvePoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { input: 0, output: 0 }
    return { input: Math.round(Math.max(0, Math.min(255, (event.clientX - rect.left) / rect.width * 255))), output: Math.round(Math.max(0, Math.min(255, 255 - (event.clientY - rect.top) / rect.height * 255))) }
  }
  const setPoint = (index: number, next: { input: number; output: number }) => onChange(channel, points.map((point, candidate) => candidate === index ? next : point).sort((left, right) => left.input - right.input), `curve-${channel}`)
  const applyRangePoint = (kind: 'black' | 'median' | 'white') => {
    const sampled = histogramRange(histogram)[kind]
    const next = kind === 'black' ? { input: sampled, output: 0 } : kind === 'white' ? { input: sampled, output: 255 } : { input: sampled, output: 128 }
    onChange(channel, [...points.filter((point) => point.input !== next.input), next].sort((left, right) => left.input - right.input))
  }
  const maximum = Math.max(1, ...histogram)
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.input} ${255 - point.output}`).join(' ')
  const histogramPath = histogram.map((count, index) => `${index ? 'L' : 'M'} ${index} ${255 - count / maximum * 235}`).join(' ') + ' L 255 255 L 0 255 Z'

  return <div className="rounded-lg border border-white/[0.07] bg-black/20 p-2.5">
    <div className="mb-2 flex gap-1">{(['rgb', 'red', 'green', 'blue'] as Channel[]).map((value) => <button key={value} type="button" aria-pressed={channel === value} onClick={() => setChannel(value)} className={`flex-1 rounded py-1 text-[8px] uppercase ${channel === value ? 'bg-white/[0.1] text-zinc-200' : 'text-zinc-700 hover:text-zinc-400'}`}>{value}</button>)}</div>
    <svg ref={svgRef} viewBox="0 0 255 255" aria-label={`${channel} curve editor`} className="aspect-square w-full touch-none rounded border border-white/[0.08] bg-[#0a0a0c]" onPointerDown={(event) => { const next = curvePoint(event); const updated = [...points, next].toSorted((left, right) => left.input - right.input); dragIndexRef.current = updated.findIndex((point) => point === next); onChange(channel, updated, `curve-${channel}`); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={(event) => { if (dragIndexRef.current !== null) setPoint(dragIndexRef.current, curvePoint(event)) }} onPointerUp={() => { dragIndexRef.current = null; onChangeEnd() }} onPointerCancel={() => { dragIndexRef.current = null; onChangeEnd() }}>
      {[64, 128, 192].map((value) => <g key={value}><line x1={value} x2={value} y1="0" y2="255" stroke="#27272a" strokeWidth="1" /><line y1={value} y2={value} x1="0" x2="255" stroke="#27272a" strokeWidth="1" /></g>)}
      <path d={histogramPath} fill="#71717a" opacity="0.25" />
      <path d={path} fill="none" stroke={channelColor[channel]} strokeWidth="2" />
      {points.map((point, index) => <circle key={`${point.input}-${index}`} cx={point.input} cy={255 - point.output} r="4" fill="#18181b" stroke={channelColor[channel]} strokeWidth="2" onPointerDown={(event) => { event.stopPropagation(); dragIndexRef.current = index; event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId) }} onDoubleClick={(event) => { event.stopPropagation(); if (index > 0 && index < points.length - 1) onChange(channel, points.filter((_, candidate) => candidate !== index)) }} />)}
    </svg>
    <div className="mt-2 grid grid-cols-3 gap-1">{(['black', 'median', 'white'] as const).map((kind) => <button key={kind} type="button" onClick={() => applyRangePoint(kind)} title={`Sample ${kind === 'median' ? 'gray' : kind} point from the visible histogram`} className="rounded border border-white/[0.07] py-1 text-[8px] capitalize text-zinc-600 hover:text-zinc-200">{kind === 'median' ? 'Gray dropper' : `${kind} dropper`}</button>)}</div>
    <select aria-label="Curve preset" defaultValue="linear" onChange={(event) => onChange(channel, curvePreset(event.target.value as CurvePreset))} className="mt-2 w-full rounded border border-white/[0.07] bg-zinc-950 px-2 py-1.5 text-[9px] text-zinc-500"><option value="linear">Linear</option><option value="medium-contrast">Medium contrast</option><option value="strong-contrast">Strong contrast</option><option value="negative">Negative</option></select>
  </div>
}
