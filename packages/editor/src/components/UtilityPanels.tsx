import { useEffect, useRef, useState, type RefObject } from 'react'
import { historyCommandLabel } from '../editor/history-labels'
import { defaultGradients, type GradientPreset } from '../editor/gradients'
import type { HistogramChannel, HistogramResult } from '../editor/histogram'
import { getDocumentSize } from '../editor/presets'
import { defaultPatterns, type PatternPreset } from '../editor/patterns'
import { getLayerBounds } from '../editor/renderer'
import type { BrushPreset, CustomFontResource } from '../editor/resources'
import type { AssetMap } from '../editor/runtime-assets'
import type { SelectionState } from '../editor/selection'
import { defaultSwatches } from '../editor/swatches'
import type { DocumentHistoryCommand, EditorDocument, PatternSettings } from '../editor/types'

export function HistoryPanel({ past, future, rasterUndoDepth, onJump }: {
  past: DocumentHistoryCommand[]
  future: DocumentHistoryCommand[]
  rasterUndoDepth: number
  onJump: (index: number) => void
}) {
  const currentIndex = past.length
  const entries = [
    { index: 0, label: 'Document opened', future: false },
    ...past.map((command, index) => ({ index: index + 1, label: historyCommandLabel(command), future: false })),
    ...future.map((command, index) => ({ index: currentIndex + index + 1, label: historyCommandLabel(command), future: true })),
  ]

  return (
    <div role="tabpanel" aria-label="History" className="min-h-0 flex-1 overflow-y-auto p-2">
      {rasterUndoDepth > 0 && <div className="mb-2 rounded-lg border border-cyan-300/10 bg-cyan-300/[0.04] px-3 py-2 text-[9px] leading-relaxed text-cyan-100/60">{rasterUndoDepth} raster edit{rasterUndoDepth === 1 ? '' : 's'} are also available through Undo.</div>}
      <div className="space-y-0.5">
        {entries.map((entry) => (
          <button key={`${entry.index}:${entry.label}`} type="button" aria-current={entry.index === currentIndex ? 'step' : undefined} onClick={() => onJump(entry.index)} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] transition focus-visible:outline-2 focus-visible:outline-violet-400 ${entry.index === currentIndex ? 'bg-violet-400/15 text-violet-100' : entry.future ? 'text-zinc-700 hover:bg-white/[0.03] hover:text-zinc-500' : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200'}`}>
            <span className={`size-1.5 shrink-0 rounded-full ${entry.index === currentIndex ? 'bg-violet-300' : entry.future ? 'border border-zinc-700' : 'bg-zinc-700'}`} />
            <span className="truncate">{entry.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function NavigatorPanel({ sourceCanvasRef, document, zoom, onZoomChange, renderRevision }: {
  sourceCanvasRef: RefObject<HTMLCanvasElement | null>
  document: EditorDocument
  zoom: number
  onZoomChange: (zoom: number) => void
  renderRevision: number
}) {
  const previewRef = useRef<HTMLCanvasElement>(null)
  const size = getDocumentSize(document)

  useEffect(() => {
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const source = sourceCanvasRef.current
        const preview = previewRef.current
        const context = preview?.getContext('2d')
        if (!source || !preview || !context || source.width === 0 || source.height === 0) return
        const scale = Math.min(360 / source.width, 260 / source.height)
        preview.width = Math.max(1, Math.round(source.width * scale))
        preview.height = Math.max(1, Math.round(source.height * scale))
        context.clearRect(0, 0, preview.width, preview.height)
        context.drawImage(source, 0, 0, preview.width, preview.height)
      })
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [document, sourceCanvasRef, renderRevision])

  return (
    <div role="tabpanel" aria-label="Navigator" className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-[repeating-conic-gradient(#202024_0_25%,#17171a_0_50%)_50%/12px_12px] p-2">
        <canvas ref={previewRef} aria-label="Document navigator preview" className="mx-auto block h-auto max-h-64 w-full object-contain shadow-[0_8px_30px_rgba(0,0,0,0.35)]" />
      </div>
      <p className="mt-2 text-center font-mono text-[9px] text-zinc-700">{size.width} × {size.height}px</p>
      <div className="mt-4 rounded-lg border border-white/[0.07] bg-black/20 p-3">
        <div className="mb-2 flex items-center justify-between text-[10px] text-zinc-500"><span>Zoom</span><span className="font-mono text-zinc-300">{Math.round(zoom)}%</span></div>
        <input aria-label="Navigator zoom" type="range" min="25" max="250" step="5" value={zoom} onChange={(event) => onZoomChange(Number(event.target.value))} className="w-full accent-violet-400" />
        <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => onZoomChange(50)} className="rounded-md border border-white/[0.07] px-2 py-1.5 text-[10px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200">50%</button><button type="button" onClick={() => onZoomChange(100)} className="rounded-md border border-white/[0.07] px-2 py-1.5 text-[10px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200">100%</button></div>
      </div>
    </div>
  )
}

type HistogramView = 'rgb' | HistogramChannel

function histogramPath(bins: number[], maximum: number) {
  const points = bins.map((value, index) => `${index},${110 - value / maximum * 106}`).join(' L')
  return `M0,110 L${points} L255,110 Z`
}

export function HistogramPanel({ sourceCanvasRef, document, renderRevision }: {
  sourceCanvasRef: RefObject<HTMLCanvasElement | null>
  document: EditorDocument
  renderRevision: number
}) {
  const [view, setView] = useState<HistogramView>('rgb')
  const [result, setResult] = useState<HistogramResult | null>(null)
  const [status, setStatus] = useState<'sampling' | 'ready' | 'error'>('sampling')
  const workerRef = useRef<Worker | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    const worker = new Worker(new URL('../editor/workers/histogram.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ id: number; result: HistogramResult }>) => {
      if (event.data.id !== requestRef.current) return
      setResult(event.data.result)
      setStatus('ready')
    }
    worker.onerror = () => setStatus('error')
    workerRef.current = worker
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const source = sourceCanvasRef.current
        const worker = workerRef.current
        if (!source || !worker || source.width === 0 || source.height === 0) return
        const id = requestRef.current + 1
        requestRef.current = id
        setStatus('sampling')
        void createImageBitmap(source).then((bitmap) => {
          if (id !== requestRef.current) {
            bitmap.close()
            return
          }
          worker.postMessage({ id, bitmap, maxSize: 256 }, [bitmap])
        }).catch(() => setStatus('error'))
      })
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [document, renderRevision, sourceCanvasRef])

  const visibleChannels: HistogramChannel[] = view === 'rgb' ? ['red', 'green', 'blue'] : [view]
  const maximum = Math.max(1, ...visibleChannels.flatMap((channel) => result?.bins[channel] ?? []))
  const statisticChannel: HistogramChannel = view === 'rgb' ? 'luminance' : view
  const channelStyles: Record<HistogramChannel, { fill: string; stroke: string }> = {
    red: { fill: 'rgba(248,113,113,0.18)', stroke: '#f87171' },
    green: { fill: 'rgba(74,222,128,0.18)', stroke: '#4ade80' },
    blue: { fill: 'rgba(96,165,250,0.18)', stroke: '#60a5fa' },
    luminance: { fill: 'rgba(196,181,253,0.25)', stroke: '#c4b5fd' },
  }

  return (
    <div role="tabpanel" aria-label="Histogram" className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-5 gap-1 rounded-lg bg-black/25 p-1">
        {(['rgb', 'red', 'green', 'blue', 'luminance'] as HistogramView[]).map((channel) => <button key={channel} type="button" aria-pressed={view === channel} onClick={() => setView(channel)} className={`rounded-md px-1 py-1.5 text-[8px] font-semibold uppercase transition ${view === channel ? 'bg-white/[0.09] text-zinc-100' : 'text-zinc-700 hover:text-zinc-400'}`}>{channel === 'luminance' ? 'Lum' : channel}</button>)}
      </div>
      <div className="relative mt-3 overflow-hidden rounded-lg border border-white/[0.08] bg-black/35 p-2">
        <div className="pointer-events-none absolute inset-2 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:25%_25%]" />
        {result ? <svg viewBox="0 0 255 110" preserveAspectRatio="none" aria-label={`${view} histogram`} className="relative h-40 w-full">
          {visibleChannels.map((channel) => <path key={channel} d={histogramPath(result.bins[channel], maximum)} fill={channelStyles[channel].fill} stroke={channelStyles[channel].stroke} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />)}
        </svg> : <div className="flex h-40 items-center justify-center text-[10px] text-zinc-700">Sampling document…</div>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-white/[0.06] bg-black/15 p-2"><p className="text-[8px] text-zinc-700 uppercase">Mean</p><p className="mt-1 font-mono text-[11px] text-zinc-300">{result ? result.mean[statisticChannel].toFixed(1) : '—'}</p></div>
        <div className="rounded-lg border border-white/[0.06] bg-black/15 p-2"><p className="text-[8px] text-zinc-700 uppercase">Median</p><p className="mt-1 font-mono text-[11px] text-zinc-300">{result ? result.median[statisticChannel] : '—'}</p></div>
        <div className="rounded-lg border border-white/[0.06] bg-black/15 p-2"><p className="text-[8px] text-zinc-700 uppercase">Samples</p><p className="mt-1 truncate font-mono text-[11px] text-zinc-300">{result ? result.pixels.toLocaleString() : '—'}</p></div>
      </div>
      <p className={`mt-3 text-center text-[9px] ${status === 'error' ? 'text-red-300/70' : 'text-zinc-700'}`}>{status === 'error' ? 'The rendered canvas could not be sampled.' : status === 'sampling' ? 'Updating sampled histogram…' : 'RGB and luminance reduction runs in a local Worker.'}</p>
    </div>
  )
}

export function SwatchesPanel({ foregroundColor, backgroundColor, customSwatches, onForegroundColorChange, onBackgroundColorChange, onAddSwatch, onRemoveSwatch }: {
  foregroundColor: string
  backgroundColor: string
  customSwatches: string[]
  onForegroundColorChange: (color: string) => void
  onBackgroundColorChange: (color: string) => void
  onAddSwatch: (color: string) => void
  onRemoveSwatch: (color: string) => void
}) {
  const [target, setTarget] = useState<'foreground' | 'background'>('foreground')
  const activeColor = target === 'foreground' ? foregroundColor : backgroundColor
  const setActiveColor = target === 'foreground' ? onForegroundColorChange : onBackgroundColorChange

  return (
    <div role="tabpanel" aria-label="Swatches" className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-black/20 p-3">
        <div className="relative h-12 w-16">
          <button type="button" aria-label="Edit background color" aria-pressed={target === 'background'} onClick={() => setTarget('background')} style={{ backgroundColor }} className={`absolute right-0 bottom-0 size-9 rounded-md border shadow ${target === 'background' ? 'z-10 border-violet-300 ring-2 ring-violet-400/20' : 'border-white/20'}`} />
          <button type="button" aria-label="Edit foreground color" aria-pressed={target === 'foreground'} onClick={() => setTarget('foreground')} style={{ backgroundColor: foregroundColor }} className={`absolute top-0 left-0 size-9 rounded-md border shadow ${target === 'foreground' ? 'z-10 border-violet-300 ring-2 ring-violet-400/20' : 'border-white/20'}`} />
        </div>
        <div className="min-w-0 flex-1 pl-3"><p className="text-[8px] font-semibold tracking-[0.14em] text-zinc-700 uppercase">{target}</p><p className="mt-1 truncate font-mono text-xs text-zinc-300 uppercase">{activeColor}</p></div>
        <div className="flex items-center gap-1"><button type="button" aria-label="Swap foreground and background colors" title="Swap colors" onClick={() => { onForegroundColorChange(backgroundColor); onBackgroundColorChange(foregroundColor) }} className="flex size-7 items-center justify-center rounded-md text-sm text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-200">⇄</button><button type="button" aria-label="Reset foreground and background colors" title="Default colors" onClick={() => { onForegroundColorChange('#000000'); onBackgroundColorChange('#ffffff') }} className="flex size-7 items-center justify-center rounded-md text-[10px] text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-200">D</button></div>
      </div>
      <label className="mt-3 flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/15 p-2 text-[9px] text-zinc-600"><input aria-label={`Choose ${target} color`} type="color" value={activeColor} onChange={(event) => setActiveColor(event.target.value)} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" /><span className="flex-1">Choose colour</span><span className="font-mono text-zinc-400 uppercase">{activeColor}</span></label>
      <section className="mt-4"><h3 className="mb-2 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Studio palette</h3><div className="grid grid-cols-5 gap-1.5">{defaultSwatches.map((color) => <button key={color} type="button" aria-label={`Set ${target} color to ${color}`} title={color.toUpperCase()} onClick={() => setActiveColor(color)} style={{ backgroundColor: color }} className={`aspect-square rounded-md border transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-violet-400 ${activeColor === color ? 'border-violet-300 ring-2 ring-violet-400/20' : color === '#ffffff' ? 'border-zinc-600' : 'border-white/10'}`} />)}</div></section>
      <section className="mt-4"><div className="mb-2 flex items-center justify-between"><h3 className="text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Custom swatches</h3><button type="button" onClick={() => onAddSwatch(activeColor)} className="rounded-md border border-white/[0.07] px-2 py-1 text-[9px] text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-200">+ Save current</button></div>{customSwatches.length ? <div className="grid grid-cols-5 gap-1.5">{customSwatches.map((color) => <div key={color} className="group relative aspect-square"><button type="button" aria-label={`Set ${target} color to custom swatch ${color}`} title={color.toUpperCase()} onClick={() => setActiveColor(color)} style={{ backgroundColor: color }} className={`size-full rounded-md border transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-violet-400 ${activeColor === color ? 'border-violet-300 ring-2 ring-violet-400/20' : 'border-white/10'}`} /><button type="button" aria-label={`Delete custom swatch ${color}`} onClick={() => onRemoveSwatch(color)} className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-zinc-900 text-[9px] text-zinc-500 opacity-0 shadow transition hover:text-red-300 group-hover:opacity-100 focus-visible:opacity-100">×</button></div>)}</div> : <div className="rounded-lg border border-dashed border-white/[0.07] px-3 py-5 text-center text-[9px] text-zinc-700">Save the active colour to build a local palette.</div>}</section>
      <p className="mt-4 text-center text-[9px] leading-relaxed text-zinc-700">Swatches set the shared brush, fill, gradient, text, and shape colour.</p>
    </div>
  )
}

function GradientRow({ gradient, custom, onApply, onRemove }: { gradient: GradientPreset; custom?: boolean; onApply: () => void; onRemove?: () => void }) {
  return (
    <div className="group flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/15 p-1.5">
      <button type="button" aria-label={`Use ${gradient.name} gradient`} onClick={onApply} className="min-w-0 flex flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-violet-400"><span style={{ backgroundImage: `linear-gradient(90deg, ${gradient.start}, ${gradient.end})` }} className="h-8 w-16 shrink-0 rounded border border-white/10" /><span className="min-w-0"><span className="block truncate text-[10px] font-medium text-zinc-400">{gradient.name}</span><span className="block truncate font-mono text-[8px] text-zinc-700 uppercase">{gradient.start} · {gradient.end}</span></span></button>
      {custom && onRemove && <button type="button" aria-label={`Delete gradient ${gradient.name}`} onClick={onRemove} className="flex size-6 shrink-0 items-center justify-center rounded text-zinc-700 opacity-0 transition hover:bg-red-400/10 hover:text-red-300 group-hover:opacity-100 focus-visible:opacity-100">×</button>}
    </div>
  )
}

export function GradientsPanel({ foregroundColor, backgroundColor, customGradients, onApplyGradient, onAddGradient, onRemoveGradient }: {
  foregroundColor: string
  backgroundColor: string
  customGradients: GradientPreset[]
  onApplyGradient: (gradient: Pick<GradientPreset, 'start' | 'end'>) => void
  onAddGradient: (name: string, start: string, end: string) => void
  onRemoveGradient: (id: string) => void
}) {
  const [name, setName] = useState('')
  const current = { id: 'current', name: 'Current colours', start: foregroundColor, end: backgroundColor }
  const saveCurrent = () => {
    const nextName = name.trim()
    if (!nextName) return
    onAddGradient(nextName, foregroundColor, backgroundColor)
    setName('')
  }

  return (
    <div role="tabpanel" aria-label="Gradients" className="min-h-0 flex-1 overflow-y-auto p-3">
      <section><div className="mb-2 flex items-center justify-between"><h3 className="text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Active gradient</h3><button type="button" onClick={() => onApplyGradient({ start: backgroundColor, end: foregroundColor })} className="rounded-md border border-white/[0.07] px-2 py-1 text-[9px] text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-200">Reverse</button></div><GradientRow gradient={current} onApply={() => onApplyGradient(current)} /></section>
      <section className="mt-4"><h3 className="mb-2 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Studio gradients</h3><div className="space-y-1.5">{defaultGradients.map((gradient) => <GradientRow key={gradient.id} gradient={gradient} onApply={() => onApplyGradient(gradient)} />)}</div></section>
      <section className="mt-4"><h3 className="mb-2 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Save current pair</h3><div className="flex gap-2"><input aria-label="Custom gradient name" value={name} maxLength={48} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveCurrent() }} placeholder="Gradient name" className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-black/20 px-2.5 py-2 text-[10px] text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-violet-400/40" /><button type="button" disabled={!name.trim()} onClick={saveCurrent} className="rounded-md border border-white/[0.07] px-2.5 text-[9px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200 disabled:pointer-events-none disabled:text-zinc-800">Save</button></div></section>
      <section className="mt-4"><h3 className="mb-2 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Custom gradients</h3>{customGradients.length ? <div className="space-y-1.5">{customGradients.map((gradient) => <GradientRow key={gradient.id} gradient={gradient} custom onApply={() => onApplyGradient(gradient)} onRemove={() => onRemoveGradient(gradient.id)} />)}</div> : <div className="rounded-lg border border-dashed border-white/[0.07] px-3 py-5 text-center text-[9px] text-zinc-700">Name and save the active colour pair to build a local library.</div>}</section>
      <p className="mt-4 text-center text-[9px] leading-relaxed text-zinc-700">Choosing a preset sets both colours and activates the Gradient tool.</p>
    </div>
  )
}

function PatternPreview({ pattern }: { pattern: Pick<PatternSettings, 'kind' | 'color' | 'opacity' | 'size'> }) {
  const spacing = Math.max(8, Math.min(20, Math.round(pattern.size / 4)))
  const lines = Array.from({ length: Math.ceil(72 / spacing) + 1 }, (_, index) => index * spacing)
  return (
    <svg viewBox="0 0 72 44" aria-hidden="true" className="h-11 w-full rounded-md bg-[repeating-conic-gradient(#202024_0_25%,#18181b_0_50%)_50%/10px_10px]">
      <g fill="none" stroke={pattern.color} strokeOpacity={pattern.opacity / 100}>
        {pattern.kind === 'grid' && <>{lines.map((position) => <path key={`v${position}`} d={`M${position} 0V44`} />)}{lines.map((position) => <path key={`h${position}`} d={`M0 ${position}H72`} />)}</>}
        {pattern.kind === 'waves' && [-spacing, 0, spacing, spacing * 2, spacing * 3, spacing * 4].map((position) => <path key={position} d={`M-8 ${position} Q10 ${position - spacing / 2} 28 ${position} T64 ${position} T100 ${position}`} />)}
      </g>
      {pattern.kind === 'dots' && <g fill={pattern.color} fillOpacity={pattern.opacity / 100}>{lines.flatMap((x) => lines.map((y) => <circle key={`${x}:${y}`} cx={x} cy={y} r="1.4" />))}</g>}
    </svg>
  )
}

function PatternRow({ pattern, custom, active, onApply, onRemove }: { pattern: PatternPreset; custom?: boolean; active: boolean; onApply: () => void; onRemove?: () => void }) {
  return (
    <div className={`group relative rounded-lg border p-1.5 transition ${active ? 'border-violet-300/40 bg-violet-400/[0.08]' : 'border-white/[0.06] bg-black/15 hover:border-white/[0.12]'}`}>
      <button type="button" aria-label={`Use ${pattern.name} pattern`} aria-pressed={active} onClick={onApply} className="w-full text-left focus-visible:outline-2 focus-visible:outline-violet-400"><PatternPreview pattern={pattern} /><span className="mt-1.5 block truncate px-0.5 text-[9px] font-medium text-zinc-400">{pattern.name}</span><span className="block px-0.5 font-mono text-[8px] text-zinc-700">{pattern.kind} · {pattern.size}px</span></button>
      {custom && onRemove && <button type="button" aria-label={`Delete pattern ${pattern.name}`} onClick={onRemove} className="absolute top-2 right-2 flex size-5 items-center justify-center rounded bg-zinc-950/80 text-zinc-500 opacity-0 shadow transition hover:text-red-300 group-hover:opacity-100 focus-visible:opacity-100">×</button>}
    </div>
  )
}

export function PatternsPanel({ pattern, customPatterns, onApplyPattern, onAddPattern, onRemovePattern }: {
  pattern: PatternSettings
  customPatterns: PatternPreset[]
  onApplyPattern: (pattern: PatternSettings) => void
  onAddPattern: (name: string, pattern: PatternSettings) => void
  onRemovePattern: (id: string) => void
}) {
  const [name, setName] = useState('')
  const matches = (preset: PatternPreset) => pattern.kind === preset.kind && pattern.color === preset.color && pattern.opacity === preset.opacity && pattern.size === preset.size
  const applyPreset = (preset: PatternPreset) => onApplyPattern({ kind: preset.kind, color: preset.color, opacity: preset.opacity, size: preset.size })
  const saveCurrent = () => {
    const nextName = name.trim()
    if (!nextName || pattern.kind === 'none') return
    onAddPattern(nextName, pattern)
    setName('')
  }

  return (
    <div role="tabpanel" aria-label="Patterns" className="min-h-0 flex-1 overflow-y-auto p-3">
      <section>
        <div className="mb-2 flex items-center justify-between"><h3 className="text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Document pattern</h3><button type="button" disabled={pattern.kind === 'none'} onClick={() => onApplyPattern({ ...pattern, kind: 'none' })} className="rounded-md border border-white/[0.07] px-2 py-1 text-[9px] text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-200 disabled:pointer-events-none disabled:text-zinc-800">Clear</button></div>
        <div className="rounded-lg border border-white/[0.07] bg-black/20 p-2.5">
          <PatternPreview pattern={pattern} />
          <div className="mt-2 grid grid-cols-4 gap-1">{(['none', 'grid', 'dots', 'waves'] as PatternSettings['kind'][]).map((kind) => <button key={kind} type="button" aria-pressed={pattern.kind === kind} onClick={() => onApplyPattern({ ...pattern, kind })} className={`rounded-md py-1.5 text-[8px] font-semibold capitalize ${pattern.kind === kind ? 'bg-violet-400/15 text-violet-200' : 'bg-white/[0.03] text-zinc-600 hover:text-zinc-300'}`}>{kind}</button>)}</div>
          <label className="mt-3 flex items-center gap-2 text-[9px] text-zinc-600"><input aria-label="Pattern color" type="color" value={pattern.color} onChange={(event) => onApplyPattern({ ...pattern, color: event.target.value })} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" /><span className="flex-1">Colour</span><span className="font-mono text-zinc-400 uppercase">{pattern.color}</span></label>
          <label className="mt-3 block text-[9px] text-zinc-600"><span className="mb-1 flex justify-between"><span>Opacity</span><span className="font-mono text-zinc-400">{pattern.opacity}%</span></span><input aria-label="Pattern opacity" type="range" min="1" max="100" value={pattern.opacity} onChange={(event) => onApplyPattern({ ...pattern, opacity: Number(event.target.value) })} className="w-full accent-violet-400" /></label>
          <label className="mt-3 block text-[9px] text-zinc-600"><span className="mb-1 flex justify-between"><span>Spacing</span><span className="font-mono text-zinc-400">{pattern.size}px</span></span><input aria-label="Pattern spacing" type="range" min="12" max="160" value={pattern.size} onChange={(event) => onApplyPattern({ ...pattern, size: Number(event.target.value) })} className="w-full accent-violet-400" /></label>
        </div>
      </section>
      <section className="mt-4"><h3 className="mb-2 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Studio patterns</h3><div className="grid grid-cols-2 gap-2">{defaultPatterns.map((preset) => <PatternRow key={preset.id} pattern={preset} active={matches(preset)} onApply={() => applyPreset(preset)} />)}</div></section>
      <section className="mt-4"><h3 className="mb-2 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Save current pattern</h3><div className="flex gap-2"><input aria-label="Custom pattern name" value={name} maxLength={48} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveCurrent() }} placeholder={pattern.kind === 'none' ? 'Choose a pattern first' : 'Pattern name'} disabled={pattern.kind === 'none'} className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-black/20 px-2.5 py-2 text-[10px] text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-violet-400/40 disabled:text-zinc-700" /><button type="button" disabled={!name.trim() || pattern.kind === 'none'} onClick={saveCurrent} className="rounded-md border border-white/[0.07] px-2.5 text-[9px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200 disabled:pointer-events-none disabled:text-zinc-800">Save</button></div></section>
      <section className="mt-4"><h3 className="mb-2 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Custom patterns</h3>{customPatterns.length ? <div className="grid grid-cols-2 gap-2">{customPatterns.map((preset) => <PatternRow key={preset.id} pattern={preset} custom active={matches(preset)} onApply={() => applyPreset(preset)} onRemove={() => onRemovePattern(preset.id)} />)}</div> : <div className="rounded-lg border border-dashed border-white/[0.07] px-3 py-5 text-center text-[9px] text-zinc-700">Save the active procedural pattern to build a local library.</div>}</section>
      <p className="mt-4 text-center text-[9px] leading-relaxed text-zinc-700">Pattern changes are stored in the document and can be undone from History.</p>
    </div>
  )
}

function BrushThumbnail({ brush }: { brush: BrushPreset }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (brush.tip) {
      const scale = Math.min(56 / brush.tip.width, 56 / brush.tip.height)
      const width = brush.tip.width * scale
      const height = brush.tip.height * scale
      context.drawImage(brush.tip, (64 - width) / 2, (64 - height) / 2, width, height)
    } else {
      const gradient = context.createRadialGradient(32, 32, 8, 32, 32, 25)
      gradient.addColorStop(0, 'rgba(255,255,255,1)')
      gradient.addColorStop(0.72, 'rgba(255,255,255,0.95)')
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      context.fillStyle = gradient
      context.fillRect(0, 0, 64, 64)
    }
  }, [brush])
  return <canvas ref={canvasRef} width="64" height="64" aria-hidden="true" className="size-12 rounded-md bg-[repeating-conic-gradient(#26262a_0_25%,#1d1d20_0_50%)_50%/8px_8px]" />
}

export function LibrariesPanel({ brushes, activeBrushId, fonts, activeFontFamily, canApplyFont, onBrushChange, onLoadBrush, onRemoveBrush, onApplyFont, onLoadFont }: {
  brushes: BrushPreset[]
  activeBrushId: string
  fonts: CustomFontResource[]
  activeFontFamily?: string
  canApplyFont: boolean
  onBrushChange: (id: string) => void
  onLoadBrush: () => void
  onRemoveBrush: (id: string) => void
  onApplyFont: (family: string) => void
  onLoadFont: () => void
}) {
  const [view, setView] = useState<'brushes' | 'fonts'>('brushes')
  return (
    <div role="tabpanel" aria-label="Libraries" className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/25 p-1">{(['brushes', 'fonts'] as const).map((tab) => <button key={tab} type="button" aria-pressed={view === tab} onClick={() => setView(tab)} className={`rounded-md py-2 text-[9px] font-semibold capitalize transition ${view === tab ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-700 hover:text-zinc-400'}`}>{tab}</button>)}</div>
      {view === 'brushes' && <>
        <div className="mt-4 flex items-center justify-between"><div><h3 className="text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Brush library</h3><p className="mt-1 text-[9px] text-zinc-700">Stored locally in this browser</p></div><button type="button" onClick={onLoadBrush} className="rounded-md border border-white/[0.08] px-2.5 py-1.5 text-[9px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200">+ Import</button></div>
        <div className="mt-3 grid grid-cols-2 gap-2">{brushes.map((brush) => <div key={brush.id} className={`group relative rounded-lg border p-2 transition ${activeBrushId === brush.id ? 'border-violet-300/40 bg-violet-400/[0.08]' : 'border-white/[0.06] bg-black/15 hover:border-white/[0.12]'}`}><button type="button" aria-label={`Use ${brush.name} brush`} aria-pressed={activeBrushId === brush.id} onClick={() => onBrushChange(brush.id)} className="flex w-full flex-col items-center text-center focus-visible:outline-2 focus-visible:outline-violet-400"><BrushThumbnail brush={brush} /><span className="mt-2 block w-full truncate text-[9px] font-medium text-zinc-400">{brush.name}</span><span className="font-mono text-[8px] text-zinc-700">{brush.spacing}% spacing</span></button>{!brush.builtIn && <button type="button" aria-label={`Delete brush ${brush.name}`} onClick={() => onRemoveBrush(brush.id)} className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded bg-zinc-950/80 text-zinc-500 opacity-0 shadow transition hover:text-red-300 group-hover:opacity-100 focus-visible:opacity-100">×</button>}</div>)}</div>
        {brushes.length === 1 && <div className="mt-3 rounded-lg border border-dashed border-white/[0.07] px-3 py-5 text-center text-[9px] leading-relaxed text-zinc-700">Import a PNG, JPEG, WebP, or Studio brush preset to add a custom tip.</div>}
      </>}
      {view === 'fonts' && <>
        <div className="mt-4 flex items-center justify-between"><div><h3 className="text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Font library</h3><p className="mt-1 text-[9px] text-zinc-700">TTF, OTF, WOFF, or WOFF2</p></div><button type="button" onClick={onLoadFont} className="rounded-md border border-white/[0.08] px-2.5 py-1.5 text-[9px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200">+ Import</button></div>
        {fonts.length ? <div className="mt-3 space-y-2">{fonts.map((font) => <button key={font.id} type="button" aria-label={`Use ${font.name} font`} aria-pressed={activeFontFamily === font.family} disabled={!canApplyFont} onClick={() => onApplyFont(font.family)} className={`w-full rounded-lg border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-45 ${activeFontFamily === font.family ? 'border-violet-300/40 bg-violet-400/[0.08]' : 'border-white/[0.06] bg-black/15 hover:border-white/[0.12]'}`}><span style={{ fontFamily: font.family }} className="block truncate text-lg text-zinc-200">Aa Bb Cc</span><span className="mt-1 block truncate text-[9px] text-zinc-500">{font.name}</span></button>)}</div> : <div className="mt-3 rounded-lg border border-dashed border-white/[0.07] px-3 py-5 text-center text-[9px] leading-relaxed text-zinc-700">Import a font to keep it available locally across editing sessions.</div>}
        <p className="mt-4 text-center text-[9px] leading-relaxed text-zinc-700">{canApplyFont ? 'Choose a font to apply it to the selected text layer.' : 'Select a text layer to apply a library font.'}</p>
      </>}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-white/[0.05] py-2.5 last:border-0"><dt className="text-[10px] text-zinc-600">{label}</dt><dd className="text-right font-mono text-[10px] text-zinc-300">{value}</dd></div>
}

export function InfoPanel({ sourceCanvasRef, document, assets, selection, zoom, renderer }: {
  sourceCanvasRef: RefObject<HTMLCanvasElement | null>
  document: EditorDocument
  assets: AssetMap
  selection: SelectionState | null
  zoom: number
  renderer: 'canvas2d' | 'webgpu'
}) {
  const size = getDocumentSize(document)
  const selectedLayer = document.layers.find((layer) => layer.id === document.selectedLayerId)
  const canvas = sourceCanvasRef.current
  const context = canvas?.getContext('2d')
  const bounds = canvas && context && selectedLayer ? getLayerBounds(context, canvas, selectedLayer, assets) : null
  const selectedName = document.groups.find((group) => group.id === document.selectedGroupId)?.name ?? selectedLayer?.name ?? 'None'

  return (
    <div role="tabpanel" aria-label="Info" className="min-h-0 flex-1 overflow-y-auto p-3">
      <section className="rounded-lg border border-white/[0.07] bg-black/15 px-3">
        <h3 className="pt-3 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Document</h3>
        <dl><InfoRow label="Dimensions" value={`${size.width} × ${size.height}px`} /><InfoRow label="Zoom" value={`${Math.round(zoom)}%`} /><InfoRow label="Renderer" value={renderer === 'webgpu' ? 'TypeGPU' : 'Canvas2D'} /><InfoRow label="Stack" value={`${document.layers.length} layers · ${document.groups.length} groups`} /></dl>
      </section>
      <section className="mt-3 rounded-lg border border-white/[0.07] bg-black/15 px-3">
        <h3 className="pt-3 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Selection</h3>
        <dl><InfoRow label="Object" value={selectedName} />{bounds && <><InfoRow label="Position" value={`${Math.round(bounds.x)}, ${Math.round(bounds.y)}`} /><InfoRow label="Size" value={`${Math.round(bounds.width)} × ${Math.round(bounds.height)}`} /><InfoRow label="Rotation" value={`${Math.round(bounds.rotation * 10) / 10}°`} /></>}{selection?.bounds && <><InfoRow label="Pixel origin" value={`${selection.bounds.x}, ${selection.bounds.y}`} /><InfoRow label="Pixel size" value={`${selection.bounds.width} × ${selection.bounds.height}`} /></>}</dl>
      </section>
    </div>
  )
}
