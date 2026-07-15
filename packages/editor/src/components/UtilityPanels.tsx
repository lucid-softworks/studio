import { useEffect, useRef, useState, type RefObject } from 'react'
import { historyCommandLabel } from '../editor/history-labels'
import { defaultGradients, type GradientPreset } from '../editor/gradients'
import type { HistogramChannel, HistogramResult } from '../editor/histogram'
import { getDocumentSize } from '../editor/presets'
import { getLayerBounds } from '../editor/renderer'
import type { AssetMap } from '../editor/runtime-assets'
import type { SelectionState } from '../editor/selection'
import { defaultSwatches } from '../editor/swatches'
import type { DocumentHistoryCommand, EditorDocument } from '../editor/types'

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
        try {
          const scale = Math.min(1, 256 / source.width, 256 / source.height)
          const sample = globalThis.document.createElement('canvas')
          sample.width = Math.max(1, Math.round(source.width * scale))
          sample.height = Math.max(1, Math.round(source.height * scale))
          const context = sample.getContext('2d', { willReadFrequently: true })
          if (!context) throw new Error('Canvas sampling is unavailable')
          context.drawImage(source, 0, 0, sample.width, sample.height)
          const image = context.getImageData(0, 0, sample.width, sample.height)
          const id = requestRef.current + 1
          requestRef.current = id
          setStatus('sampling')
          worker.postMessage({ id, data: image.data.buffer }, [image.data.buffer])
        } catch {
          setStatus('error')
        }
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
