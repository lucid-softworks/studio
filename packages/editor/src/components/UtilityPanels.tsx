import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { historyCommandLabel } from '../editor/history-labels'
import { defaultGradients, gradientStops, normalizeGradientStops, type GradientPreset, type GradientStop } from '../editor/gradients'
import type { HistogramChannel, HistogramResult } from '../editor/histogram'
import { getDocumentSize } from '../editor/presets'
import { navigatorPointToScroll, scrollMetricsToNavigatorViewport, type NavigatorViewport } from '../editor/navigation'
import { defaultPatterns, patternBitmapCanvas, type PatternPreset } from '../editor/patterns'
import { getLayerBounds } from '../editor/renderer'
import { getTypeGpuRoot } from '../editor/rendering/typegpu-runtime'
import type { BrushPreset, CustomFontResource } from '../editor/resources'
import type { AssetMap } from '../editor/runtime-assets'
import type { CustomShapePreset } from '../editor/shape-library'
import type { ComponentChannel, SelectionMode, SelectionState } from '../editor/selection'
import { defaultSwatches } from '../editor/swatches'
import type { DocumentChannel, DocumentHistoryCommand, DocumentPath, EditorDocument, PatternSettings, VectorPath } from '../editor/types'
import { actionCommandLabels, normalizeActions, type ActionCommand, type ActionCondition, type ActionPreset, type ActionStep } from '../editor/actions'
import { downloadBlob } from '../editor/download'
import type { StudioPlugin } from '../editor/plugins'

export type AlphaChannelTransform = 'invert' | 'flip-horizontal' | 'flip-vertical' | 'rotate-clockwise'

const histogramChannelStyles: Record<HistogramChannel, { fill: string; stroke: string }> = {
  red: { fill: 'rgba(248,113,113,0.18)', stroke: '#f87171' },
  green: { fill: 'rgba(74,222,128,0.18)', stroke: '#4ade80' },
  blue: { fill: 'rgba(96,165,250,0.18)', stroke: '#60a5fa' },
  luminance: { fill: 'rgba(196,181,253,0.25)', stroke: '#c4b5fd' },
}

export function ChannelsPanel({ channels, hasSelection, onLoadComponent, onSaveSelection, onLoadAlpha, onDuplicateAlpha, onDeleteAlpha, onTransformAlpha }: {
  channels: DocumentChannel[]
  hasSelection: boolean
  onLoadComponent: (channel: ComponentChannel, mode: SelectionMode) => void
  onSaveSelection: (name: string) => void
  onLoadAlpha: (channel: DocumentChannel, mode: SelectionMode) => void
  onDuplicateAlpha: (channel: DocumentChannel) => void
  onDeleteAlpha: (channel: DocumentChannel) => void
  onTransformAlpha: (channel: DocumentChannel, operation: AlphaChannelTransform) => void
}) {
  const [model, setModel] = useState<'rgb' | 'cmyk'>('rgb')
  const [combineMode, setCombineMode] = useState<SelectionMode>('replace')
  const [selectedAlphaIndex, setSelectedAlphaIndex] = useState<number | null>(channels.length ? 0 : null)
  const [name, setName] = useState('')
  const components: Array<{ id: ComponentChannel; name: string; color: string }> = model === 'rgb'
    ? [{ id: 'red', name: 'Red', color: '#ef4444' }, { id: 'green', name: 'Green', color: '#22c55e' }, { id: 'blue', name: 'Blue', color: '#3b82f6' }]
    : [{ id: 'cyan', name: 'Cyan', color: '#06b6d4' }, { id: 'magenta', name: 'Magenta', color: '#ec4899' }, { id: 'yellow', name: 'Yellow', color: '#eab308' }, { id: 'black', name: 'Black', color: '#3f3f46' }]
  const selectedAlpha = selectedAlphaIndex === null ? undefined : channels[selectedAlphaIndex]
  const save = () => {
    if (!hasSelection) return
    onSaveSelection(name.trim() || `Alpha ${channels.length + 1}`)
    setName('')
    setSelectedAlphaIndex(channels.length)
  }

  return (
    <div role="tabpanel" aria-label="Channels" className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/25 p-1">{(['rgb', 'cmyk'] as const).map((value) => <button key={value} type="button" aria-pressed={model === value} onClick={() => { setModel(value); setSelectedAlphaIndex(null) }} className={`rounded-md py-2 text-[9px] font-semibold uppercase transition ${model === value ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-700 hover:text-zinc-400'}`}>{value}</button>)}</div>
      <section className="mt-3">
        <h3 className="mb-2 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">{model} components</h3>
        <div className="space-y-1">
          <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-black/15 px-2.5 py-2"><span className="size-5 rounded bg-[linear-gradient(135deg,#ef4444,#22c55e_50%,#3b82f6)]" /><span className="flex-1 text-[10px] text-zinc-400">{model.toUpperCase()} composite</span></div>
          {components.map((component) => <button key={component.id} type="button" onClick={() => { setSelectedAlphaIndex(null); onLoadComponent(component.id, combineMode) }} className="flex w-full items-center gap-2 rounded-md border border-transparent px-2.5 py-2 text-left transition hover:border-white/[0.06] hover:bg-white/[0.03]"><span style={{ backgroundColor: component.color }} className="size-5 rounded" /><span className="flex-1 text-[10px] text-zinc-400">{component.name}</span><span className="text-[8px] text-zinc-700">Select</span></button>)}
        </div>
      </section>
      <section className="mt-4">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Alpha channels</h3><span className="font-mono text-[8px] text-zinc-700">{channels.length}</span></div>
        {channels.length ? <div className="space-y-1">{channels.map((channel, index) => <button key={channel.id ?? channel.name} type="button" aria-pressed={selectedAlphaIndex === index} onClick={() => setSelectedAlphaIndex(index)} onDoubleClick={() => onLoadAlpha(channel, combineMode)} className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition ${selectedAlphaIndex === index ? 'border-violet-300/30 bg-violet-400/[0.08]' : 'border-transparent hover:border-white/[0.06] hover:bg-white/[0.03]'}`}><span className="size-5 rounded border border-white/10 bg-[linear-gradient(135deg,#fff,#111)]" /><span className="min-w-0 flex-1 truncate text-[10px] text-zinc-400">{channel.name}</span><span className="text-[8px] text-zinc-700">α</span></button>)}</div> : <div className="rounded-lg border border-dashed border-white/[0.07] px-3 py-5 text-center text-[9px] leading-relaxed text-zinc-700">Save a pixel selection to keep it as an editable alpha channel.</div>}
      </section>
      <section className="mt-4">
        <p className="text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Selection combine</p>
        <select aria-label="Channel selection combine mode" value={combineMode} onChange={(event) => setCombineMode(event.target.value as SelectionMode)} className="mt-2 w-full rounded-md border border-white/[0.08] bg-zinc-950 px-2.5 py-2 text-[9px] text-zinc-400 outline-none"><option value="replace">Replace selection</option><option value="add">Add to selection</option><option value="subtract">Subtract from selection</option><option value="intersect">Intersect selection</option></select>
        <div className="mt-2 flex gap-2"><input aria-label="New alpha channel name" value={name} maxLength={48} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') save() }} placeholder={`Alpha ${channels.length + 1}`} className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-black/20 px-2.5 py-2 text-[9px] text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-violet-400/40" /><button type="button" disabled={!hasSelection} onClick={save} className="rounded-md border border-white/[0.07] px-2.5 text-[9px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200 disabled:pointer-events-none disabled:text-zinc-800">Save</button></div>
      </section>
      {selectedAlpha && <section className="mt-3 rounded-lg border border-white/[0.07] bg-black/15 p-2.5"><div className="grid grid-cols-3 gap-1"><button type="button" onClick={() => onLoadAlpha(selectedAlpha, combineMode)} className="rounded-md bg-white/[0.04] py-2 text-[8px] text-zinc-500 hover:text-zinc-200">Load</button><button type="button" onClick={() => onDuplicateAlpha(selectedAlpha)} className="rounded-md bg-white/[0.04] py-2 text-[8px] text-zinc-500 hover:text-zinc-200">Duplicate</button><button type="button" onClick={() => { onDeleteAlpha(selectedAlpha); setSelectedAlphaIndex(null) }} className="rounded-md bg-red-400/[0.05] py-2 text-[8px] text-zinc-500 hover:text-red-300">Delete</button></div><div className="mt-1 grid grid-cols-4 gap-1"><button type="button" title="Invert channel" onClick={() => onTransformAlpha(selectedAlpha, 'invert')} className="rounded-md bg-white/[0.03] py-2 text-[9px] text-zinc-600 hover:text-zinc-200">±</button><button type="button" title="Flip channel horizontally" onClick={() => onTransformAlpha(selectedAlpha, 'flip-horizontal')} className="rounded-md bg-white/[0.03] py-2 text-[9px] text-zinc-600 hover:text-zinc-200">↔</button><button type="button" title="Flip channel vertically" onClick={() => onTransformAlpha(selectedAlpha, 'flip-vertical')} className="rounded-md bg-white/[0.03] py-2 text-[9px] text-zinc-600 hover:text-zinc-200">↕</button><button type="button" title="Rotate channel clockwise" onClick={() => onTransformAlpha(selectedAlpha, 'rotate-clockwise')} className="rounded-md bg-white/[0.03] py-2 text-[9px] text-zinc-600 hover:text-zinc-200">↻</button></div></section>}
      <p className="mt-4 text-center text-[9px] leading-relaxed text-zinc-700">Click a colour component or double-click an alpha channel to load it as a selection.</p>
    </div>
  )
}

export function PathsPanel({ paths, selectedPathId, customShapes, onChange, onFill, onStroke, onSaveCustomShape, onApplyCustomShape, onRemoveCustomShape, onImportCustomShape, onExportPath }: {
  paths: DocumentPath[]
  selectedPathId: string | null
  customShapes: CustomShapePreset[]
  onChange: (paths: DocumentPath[], selectedPathId: string | null) => void
  onFill: (path: DocumentPath) => void
  onStroke: (path: DocumentPath) => void
  onSaveCustomShape: (path: DocumentPath) => void
  onApplyCustomShape: (shape: CustomShapePreset) => void
  onRemoveCustomShape: (id: string) => void
  onImportCustomShape: () => void
  onExportPath: (path: DocumentPath) => void
}) {
  const [name, setName] = useState('')
  const selected = paths.find((path) => path.id === selectedPathId) ?? paths.at(-1)
  const selectedIndex = selected ? paths.indexOf(selected) : -1
  const mutateSelected = (mutate: (path: DocumentPath) => DocumentPath) => {
    if (selectedIndex < 0 || !selected) return
    onChange(paths.map((path, index) => index === selectedIndex ? mutate(path) : path), selected.id)
  }
  const setOperation = (operation: VectorPath['operation']) => mutateSelected((path) => ({ ...path, paths: path.paths.map((component) => ({ ...component, operation })) }))
  const save = () => {
    if (!selected) return
    mutateSelected((path) => ({ ...path, kind: 'saved', name: name.trim() || (path.kind === 'work' ? `Path ${paths.filter((candidate) => candidate.kind !== 'work').length + 1}` : path.name) }))
    setName('')
  }
  const addPath = () => {
    const path: DocumentPath = { id: crypto.randomUUID(), name: 'Work Path', kind: 'work', paths: [] }
    onChange([...paths, path], path.id)
  }

  return (
    <div role="tabpanel" aria-label="Paths" className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="flex items-center justify-between"><div><h3 className="text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Document paths</h3><p className="mt-1 text-[9px] text-zinc-700">Work, saved, and clipping paths</p></div><button type="button" onClick={addPath} className="rounded-md border border-white/[0.08] px-2.5 py-1.5 text-[9px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200">+ New</button></div>
      {paths.length ? <div className="mt-3 space-y-1">{[...paths].reverse().map((path) => <button key={path.id} type="button" aria-pressed={selected?.id === path.id} onClick={() => onChange(paths, path.id)} className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2.5 text-left transition ${selected?.id === path.id ? 'border-cyan-300/25 bg-cyan-400/[0.07]' : 'border-transparent hover:border-white/[0.06] hover:bg-white/[0.03]'}`}><svg viewBox="0 0 28 20" aria-hidden="true" className="h-5 w-7 rounded bg-black/25"><path d="M3 16C8 2 18 2 25 14" fill="none" stroke="currentColor" className="text-cyan-300/70" /><circle cx="3" cy="16" r="1.5" fill="currentColor" /><circle cx="25" cy="14" r="1.5" fill="currentColor" /></svg><span className="min-w-0 flex-1"><span className="block truncate text-[10px] text-zinc-400">{path.name}</span><span className="block text-[8px] capitalize text-zinc-700">{path.kind} · {path.paths.length} component{path.paths.length === 1 ? '' : 's'}</span></span>{path.kind === 'clipping' && <span className="text-[8px] text-amber-300/70">Clip</span>}</button>)}</div> : <div className="mt-3 rounded-lg border border-dashed border-white/[0.07] px-3 py-6 text-center text-[9px] leading-relaxed text-zinc-700">Choose the Pen tool and click the canvas to create a work path.</div>}
      {selected && <>
        <section className="mt-4 rounded-lg border border-white/[0.07] bg-black/15 p-2.5"><p className="text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Path operation</p><div className="mt-2 grid grid-cols-4 gap-1">{([['combine', '+'], ['subtract', '−'], ['intersect', '∩'], ['exclude', '⊕']] as Array<[VectorPath['operation'], string]>).map(([operation, label]) => <button key={operation} type="button" title={operation} aria-pressed={selected.paths.every((path) => path.operation === operation)} onClick={() => setOperation(operation)} className={`rounded-md py-2 text-[10px] ${selected.paths.every((path) => path.operation === operation) ? 'bg-cyan-400/15 text-cyan-200' : 'bg-white/[0.03] text-zinc-600 hover:text-zinc-200'}`}>{label}</button>)}</div><div className="mt-2 grid grid-cols-2 gap-1"><button type="button" disabled={!selected.paths.length} onClick={() => onFill(selected)} className="rounded-md bg-white/[0.04] py-2 text-[9px] text-zinc-500 hover:text-zinc-200 disabled:opacity-30">Fill path</button><button type="button" disabled={!selected.paths.length} onClick={() => onStroke(selected)} className="rounded-md bg-white/[0.04] py-2 text-[9px] text-zinc-500 hover:text-zinc-200 disabled:opacity-30">Stroke path</button></div></section>
        <section className="mt-3"><div className="flex gap-2"><input aria-label="Saved path name" value={name} maxLength={48} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') save() }} placeholder={selected.name} className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-black/20 px-2.5 py-2 text-[9px] text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-cyan-400/40" /><button type="button" onClick={save} className="rounded-md border border-white/[0.07] px-2.5 text-[9px] text-zinc-500 hover:text-zinc-200">Save</button></div><div className="mt-2 grid grid-cols-3 gap-1"><button type="button" onClick={() => { const copy = { ...structuredClone(selected), id: crypto.randomUUID(), name: `${selected.name} copy`, kind: 'saved' as const }; onChange([...paths, copy], copy.id) }} className="rounded-md bg-white/[0.03] py-2 text-[8px] text-zinc-600 hover:text-zinc-200">Duplicate</button><button type="button" onClick={() => mutateSelected((path) => ({ ...path, kind: path.kind === 'clipping' ? 'saved' : 'clipping' }))} className="rounded-md bg-white/[0.03] py-2 text-[8px] text-zinc-600 hover:text-amber-200">{selected.kind === 'clipping' ? 'Unclip' : 'Clipping'}</button><button type="button" onClick={() => { const next = paths.filter((path) => path.id !== selected.id); onChange(next, next.at(-1)?.id ?? null) }} className="rounded-md bg-red-400/[0.04] py-2 text-[8px] text-zinc-600 hover:text-red-300">Delete</button></div><div className="mt-1 grid grid-cols-2 gap-1"><button type="button" disabled={!selected.paths.length} onClick={() => onSaveCustomShape(selected)} className="rounded-md bg-white/[0.03] py-2 text-[8px] text-zinc-600 hover:text-zinc-200 disabled:opacity-30">Add to shapes</button><button type="button" disabled={!selected.paths.length} onClick={() => onExportPath(selected)} className="rounded-md bg-white/[0.03] py-2 text-[8px] text-zinc-600 hover:text-zinc-200 disabled:opacity-30">Export shape</button></div></section>
      </>}
      <section className="mt-4"><div className="mb-2 flex items-center justify-between"><h3 className="text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Custom shapes</h3><button type="button" onClick={onImportCustomShape} className="rounded-md border border-white/[0.07] px-2 py-1 text-[8px] text-zinc-600 hover:text-zinc-200">Import</button></div>{customShapes.length ? <div className="grid grid-cols-2 gap-2">{customShapes.map((shape) => <div key={shape.id} className="group relative rounded-lg border border-white/[0.06] bg-black/15 p-2"><button type="button" onClick={() => onApplyCustomShape(shape)} className="w-full text-left"><svg viewBox="0 0 80 48" aria-hidden="true" className="h-12 w-full rounded bg-black/20"><path d="M8 39C20 5 58 5 72 35" fill="none" stroke="currentColor" className="text-cyan-300/70" /></svg><span className="mt-1 block truncate text-[9px] text-zinc-500">{shape.name}</span></button><button type="button" aria-label={`Delete ${shape.name} custom shape`} onClick={() => onRemoveCustomShape(shape.id)} className="absolute top-1 right-1 flex size-5 items-center justify-center rounded bg-zinc-950/80 text-zinc-700 opacity-0 hover:text-red-300 group-hover:opacity-100">×</button></div>)}</div> : <div className="rounded-lg border border-dashed border-white/[0.07] px-3 py-5 text-center text-[9px] text-zinc-700">Save a selected path or import a .studio-shape file.</div>}</section>
      <p className="mt-4 text-center text-[9px] leading-relaxed text-zinc-700">Pen edits are saved in the document and can be undone from History.</p>
    </div>
  )
}

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
  const [viewport, setViewport] = useState<NavigatorViewport>({ x: 0, y: 0, width: 1, height: 1 })
  const navigate = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width === 0 || bounds.height === 0) return
    const stage = globalThis.document.querySelector<HTMLElement>('.stage-grid')
    if (!stage) return
    const scroll = navigatorPointToScroll({ x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height }, stage)
    stage.scrollLeft = scroll.left
    stage.scrollTop = scroll.top
    setViewport(scrollMetricsToNavigatorViewport(stage))
  }

  useEffect(() => {
    const stage = globalThis.document.querySelector<HTMLElement>('.stage-grid')
    if (!stage) return
    const update = () => setViewport(scrollMetricsToNavigatorViewport(stage))
    const frame = requestAnimationFrame(update)
    const observer = new ResizeObserver(update)
    observer.observe(stage)
    stage.addEventListener('scroll', update, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      stage.removeEventListener('scroll', update)
    }
  }, [size.height, size.width, zoom])

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
        <div aria-label="Navigator pan surface" role="application" onPointerDown={(event) => { navigate(event); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) navigate(event) }} className="relative mx-auto w-fit max-w-full touch-none cursor-crosshair overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
          <canvas ref={previewRef} aria-label="Document navigator preview" className="block h-auto max-h-64 w-full object-contain" />
          <div aria-label="Navigator viewport" data-x={viewport.x.toFixed(4)} data-y={viewport.y.toFixed(4)} data-width={viewport.width.toFixed(4)} data-height={viewport.height.toFixed(4)} style={{ left: `${viewport.x * 100}%`, top: `${viewport.y * 100}%`, width: `${viewport.width * 100}%`, height: `${viewport.height * 100}%` }} className="pointer-events-none absolute border border-rose-400 bg-rose-400/[0.06] shadow-[0_0_0_1px_rgba(0,0,0,0.55)]" />
        </div>
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
type AnalysisView = 'histogram' | 'waveform' | 'vectorscope'

function histogramPath(bins: number[], maximum: number) {
  const points = bins.map((value, index) => `${index},${110 - value / maximum * 106}`).join(' L')
  return `M0,110 L${points} L255,110 Z`
}

function ScopeCanvas({ values, size, kind }: { values: number[]; size: number; kind: Exclude<AnalysisView, 'histogram'> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    canvas.width = size
    canvas.height = size
    const image = context.createImageData(size, size)
    const maximum = Math.max(1, ...values)
    const logarithmicMaximum = Math.log1p(maximum)
    for (let index = 0; index < values.length; index += 1) {
      const strength = Math.log1p(values[index]) / logarithmicMaximum
      if (strength === 0) continue
      const offset = index * 4
      if (kind === 'waveform') {
        image.data[offset] = Math.round(70 * strength)
        image.data[offset + 1] = Math.round(255 * strength)
        image.data[offset + 2] = Math.round(190 * strength)
      } else {
        const x = index % size
        const y = Math.floor(index / size)
        image.data[offset] = Math.round(255 * strength * x / size)
        image.data[offset + 1] = Math.round(255 * strength * (1 - Math.abs(x - y) / size))
        image.data[offset + 2] = Math.round(255 * strength * (1 - y / size))
      }
      image.data[offset + 3] = Math.round(255 * Math.min(1, strength * 1.6))
    }
    context.putImageData(image, 0, 0)
  }, [kind, size, values])
  return <canvas ref={canvasRef} aria-label={`${kind} scope`} className="relative aspect-square h-40 w-full object-fill [image-rendering:auto]" />
}

export function HistogramPanel({ sourceCanvasRef, document, assets, renderRevision }: {
  sourceCanvasRef: RefObject<HTMLCanvasElement | null>
  document: EditorDocument
  assets: AssetMap
  renderRevision: number
}) {
  const [view, setView] = useState<HistogramView>('rgb')
  const [analysisView, setAnalysisView] = useState<AnalysisView>('histogram')
  const [quality, setQuality] = useState<'sampled' | 'exact'>('sampled')
  const [result, setResult] = useState<HistogramResult | null>(null)
  const [status, setStatus] = useState<'sampling' | 'ready' | 'error'>('sampling')
  const [reducer, setReducer] = useState<'worker' | 'typegpu'>('worker')
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
        const selectedLayer = document.layers.find((layer) => layer.id === document.selectedLayerId)
        const assetId = selectedLayer && 'assetId' in selectedLayer ? selectedLayer.assetId : undefined
        const precision = assetId ? assets[assetId]?.precision : undefined
        if (quality === 'exact' && precision && precision.revision === (assets[assetId!]?.revision ?? 0)) {
          const data = precision.data.slice().buffer as ArrayBuffer
          setReducer('worker')
          worker.postMessage({ id, precision: { bitDepth: precision.bitDepth, width: precision.width, height: precision.height, data } }, [data])
          return
        }
        const root = quality === 'exact' ? getTypeGpuRoot() : null
        if (root) {
          const context = source.getContext('2d', { willReadFrequently: true })
          if (!context) { setStatus('error'); return }
          const pixels = context.getImageData(0, 0, source.width, source.height).data
          setReducer('typegpu')
          void import('../editor/rendering/typegpu-scopes').then(({ reduceColorAnalysisTypeGpu }) => reduceColorAnalysisTypeGpu(root, pixels, source.width, source.height)).then((nextResult) => {
            if (id !== requestRef.current) return
            setResult(nextResult)
            setStatus('ready')
          }).catch(() => {
            if (id !== requestRef.current) return
            setReducer('worker')
            void createImageBitmap(source).then((bitmap) => worker.postMessage({ id, bitmap, maxSize: 256, exact: true }, [bitmap])).catch(() => setStatus('error'))
          })
          return
        }
        setReducer('worker')
        void createImageBitmap(source).then((bitmap) => {
          if (id !== requestRef.current) {
            bitmap.close()
            return
          }
          worker.postMessage({ id, bitmap, maxSize: 256, exact: quality === 'exact' }, [bitmap])
        }).catch(() => setStatus('error'))
      })
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [assets, document, quality, renderRevision, sourceCanvasRef])

  const visibleChannels: HistogramChannel[] = view === 'rgb' ? ['red', 'green', 'blue'] : [view]
  const maximum = Math.max(1, ...visibleChannels.flatMap((channel) => result?.bins[channel] ?? []))
  const statisticChannel: HistogramChannel = view === 'rgb' ? 'luminance' : view
  return (
    <div role="tabpanel" aria-label="Histogram" className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg bg-black/25 p-1">{(['histogram', 'waveform', 'vectorscope'] as AnalysisView[]).map((value) => <button key={value} type="button" aria-pressed={analysisView === value} onClick={() => setAnalysisView(value)} className={`rounded-md py-1.5 text-[8px] font-semibold capitalize ${analysisView === value ? 'bg-violet-400/15 text-violet-100' : 'text-zinc-700 hover:text-zinc-400'}`}>{value}</button>)}</div>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-white/[0.06] p-1">{(['sampled', 'exact'] as const).map((value) => <button key={value} type="button" aria-pressed={quality === value} onClick={() => setQuality(value)} className={`rounded-md py-1.5 text-[8px] font-semibold capitalize ${quality === value ? 'bg-white/[0.08] text-zinc-200' : 'text-zinc-700'}`}>{value}{value === 'exact' ? ' pixels' : ''}</button>)}</div>
      {analysisView === 'histogram' && <>
      <div className="grid grid-cols-5 gap-1 rounded-lg bg-black/25 p-1">
        {(['rgb', 'red', 'green', 'blue', 'luminance'] as HistogramView[]).map((channel) => <button key={channel} type="button" aria-pressed={view === channel} onClick={() => setView(channel)} className={`rounded-md px-1 py-1.5 text-[8px] font-semibold uppercase transition ${view === channel ? 'bg-white/[0.09] text-zinc-100' : 'text-zinc-700 hover:text-zinc-400'}`}>{channel === 'luminance' ? 'Lum' : channel}</button>)}
      </div>
      </>}
      {analysisView !== 'histogram' && <div className="relative overflow-hidden rounded-lg border border-white/[0.08] bg-black/35 p-2"><div className="pointer-events-none absolute inset-2 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:25%_25%]" />{result?.scopeSize && result[analysisView] ? <ScopeCanvas values={result[analysisView]!} size={result.scopeSize} kind={analysisView} /> : <div className="flex h-40 items-center justify-center text-[10px] text-zinc-700">Reducing scope…</div>}</div>}
      <div className="relative mt-3 overflow-hidden rounded-lg border border-white/[0.08] bg-black/35 p-2">
        <div className="pointer-events-none absolute inset-2 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:25%_25%]" />
        {result ? <svg viewBox="0 0 255 110" preserveAspectRatio="none" aria-label={`${view} histogram`} className="relative h-40 w-full">
          {visibleChannels.map((channel) => <path key={channel} d={histogramPath(result.bins[channel], maximum)} fill={histogramChannelStyles[channel].fill} stroke={histogramChannelStyles[channel].stroke} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />)}
        </svg> : <div className="flex h-40 items-center justify-center text-[10px] text-zinc-700">Sampling document…</div>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-white/[0.06] bg-black/15 p-2"><p className="text-[8px] text-zinc-700 uppercase">Mean</p><p className="mt-1 font-mono text-[11px] text-zinc-300">{result ? result.mean[statisticChannel].toFixed(1) : '—'}</p></div>
        <div className="rounded-lg border border-white/[0.06] bg-black/15 p-2"><p className="text-[8px] text-zinc-700 uppercase">Median</p><p className="mt-1 font-mono text-[11px] text-zinc-300">{result ? result.median[statisticChannel] : '—'}</p></div>
        <div className="rounded-lg border border-white/[0.06] bg-black/15 p-2"><p className="text-[8px] text-zinc-700 uppercase">Samples</p><p className="mt-1 truncate font-mono text-[11px] text-zinc-300">{result ? result.pixels.toLocaleString() : '—'}</p></div>
      </div>
      <p className={`mt-3 text-center text-[9px] ${status === 'error' ? 'text-red-300/70' : 'text-zinc-700'}`}>{status === 'error' ? 'The rendered canvas could not be sampled.' : status === 'sampling' ? `Updating ${quality} analysis…` : `${result?.precision ?? 8}-bit ${result?.exact ? 'exact' : 'sampled'} reduction · ${reducer === 'typegpu' ? 'TypeGPU' : 'local Worker'}`}</p>
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
  const css = gradient.stops.map((stop) => `${stop.color} ${stop.position}%`).join(', ')
  return (
    <div className="group flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/15 p-1.5">
      <button type="button" aria-label={`Use ${gradient.name} gradient`} onClick={onApply} className="min-w-0 flex flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-violet-400"><span style={{ backgroundImage: `linear-gradient(90deg, ${css})` }} className="h-8 w-16 shrink-0 rounded border border-white/10" /><span className="min-w-0"><span className="block truncate text-[10px] font-medium text-zinc-400">{gradient.name}</span><span className="block truncate font-mono text-[8px] text-zinc-700 uppercase">{gradient.stops.length} stops · {gradient.start} · {gradient.end}</span></span></button>
      {custom && onRemove && <button type="button" aria-label={`Delete gradient ${gradient.name}`} onClick={onRemove} className="flex size-6 shrink-0 items-center justify-center rounded text-zinc-700 opacity-0 transition hover:bg-red-400/10 hover:text-red-300 group-hover:opacity-100 focus-visible:opacity-100">×</button>}
    </div>
  )
}

export function GradientsPanel({ foregroundColor, backgroundColor, customGradients, onApplyGradient, onAddGradient, onRemoveGradient }: {
  foregroundColor: string
  backgroundColor: string
  customGradients: GradientPreset[]
  onApplyGradient: (gradient: Pick<GradientPreset, 'start' | 'end' | 'stops'>) => void
  onAddGradient: (name: string, stops: GradientStop[]) => void
  onRemoveGradient: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [stops, setStops] = useState<GradientStop[]>(() => gradientStops([foregroundColor, backgroundColor]))
  const normalizedStops = normalizeGradientStops(stops, foregroundColor, backgroundColor)
  const current: GradientPreset = { id: 'current', name: 'Current gradient', stops: normalizedStops, start: normalizedStops[0].color, end: normalizedStops.at(-1)!.color }
  const apply = (gradient: GradientPreset) => { setStops(gradient.stops); onApplyGradient(gradient) }
  const saveCurrent = () => {
    const nextName = name.trim()
    if (!nextName) return
    onAddGradient(nextName, normalizedStops)
    setName('')
  }

  return (
    <div role="tabpanel" aria-label="Gradients" className="min-h-0 flex-1 overflow-y-auto p-3">
      <section><div className="mb-2 flex items-center justify-between"><h3 className="text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Active gradient</h3><button type="button" onClick={() => { const reversed = normalizedStops.toReversed().map((stop) => ({ ...stop, position: 100 - stop.position })); setStops(reversed); onApplyGradient({ start: reversed[0].color, end: reversed.at(-1)!.color, stops: reversed }) }} className="rounded-md border border-white/[0.07] px-2 py-1 text-[9px] text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-200">Reverse</button></div><GradientRow gradient={current} onApply={() => onApplyGradient(current)} /><div className="mt-2 space-y-1">{normalizedStops.map((stop, index) => <div key={`${stop.position}:${stop.color}`} className="flex items-center gap-1"><input aria-label={`Gradient stop ${index + 1} color`} type="color" value={stop.color} onChange={(event) => setStops((currentStops) => currentStops.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, color: event.target.value } : candidate))} className="size-6 border-0 bg-transparent p-0" /><input aria-label={`Gradient stop ${index + 1} position`} type="number" min="0" max="100" value={stop.position} onChange={(event) => setStops((currentStops) => currentStops.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, position: Number(event.target.value) } : candidate))} className="w-14 rounded border border-white/[0.08] bg-black/20 px-1 py-1 font-mono text-[9px] text-zinc-400" /><span className="text-[8px] text-zinc-700">%</span>{normalizedStops.length > 2 && <button type="button" aria-label={`Remove gradient stop ${index + 1}`} onClick={() => setStops((currentStops) => currentStops.filter((_, candidateIndex) => candidateIndex !== index))} className="ml-auto text-zinc-700 hover:text-red-300">×</button>}</div>)}</div><button type="button" disabled={normalizedStops.length >= 16} onClick={() => setStops((currentStops) => [...currentStops, { color: foregroundColor, position: 50 }])} className="mt-2 w-full rounded-md border border-white/[0.07] py-1.5 text-[9px] text-zinc-600 hover:text-zinc-200 disabled:opacity-30">+ Add colour stop</button></section>
      <section className="mt-4"><h3 className="mb-2 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Studio gradients</h3><div className="space-y-1.5">{defaultGradients.map((gradient) => <GradientRow key={gradient.id} gradient={gradient} onApply={() => apply(gradient)} />)}</div></section>
      <section className="mt-4"><h3 className="mb-2 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Save gradient</h3><div className="flex gap-2"><input aria-label="Custom gradient name" value={name} maxLength={48} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveCurrent() }} placeholder="Gradient name" className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-black/20 px-2.5 py-2 text-[10px] text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-violet-400/40" /><button type="button" disabled={!name.trim()} onClick={saveCurrent} className="rounded-md border border-white/[0.07] px-2.5 text-[9px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200 disabled:pointer-events-none disabled:text-zinc-800">Save</button></div></section>
      <section className="mt-4"><h3 className="mb-2 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Custom gradients</h3>{customGradients.length ? <div className="space-y-1.5">{customGradients.map((gradient) => <GradientRow key={gradient.id} gradient={gradient} custom onApply={() => apply(gradient)} onRemove={() => onRemoveGradient(gradient.id)} />)}</div> : <div className="rounded-lg border border-dashed border-white/[0.07] px-3 py-5 text-center text-[9px] text-zinc-700">Build and save a multi-stop gradient to add it here.</div>}</section>
      <p className="mt-4 text-center text-[9px] leading-relaxed text-zinc-700">Gradients support up to sixteen independently positioned colour stops.</p>
    </div>
  )
}

function PatternPreview({ pattern }: { pattern: PatternSettings }) {
  const bitmapRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const bitmap = pattern.bitmap
    const canvas = bitmapRef.current
    const context = canvas?.getContext('2d')
    if (!bitmap || !canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.globalAlpha = pattern.opacity / 100
    const tile = patternBitmapCanvas(bitmap)
    const fill = context.createPattern(tile, 'repeat')
    if (fill) { context.fillStyle = fill; context.fillRect(0, 0, canvas.width, canvas.height) }
  }, [pattern])
  if (pattern.kind === 'bitmap') return <canvas ref={bitmapRef} width="144" height="88" aria-hidden="true" className="h-11 w-full rounded-md bg-[repeating-conic-gradient(#202024_0_25%,#18181b_0_50%)_50%/10px_10px]" />
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

function PatternRow({ pattern, custom, active, onApply, onRemove, onExport }: { pattern: PatternPreset; custom?: boolean; active: boolean; onApply: () => void; onRemove?: () => void; onExport?: () => void }) {
  return (
    <div className={`group relative rounded-lg border p-1.5 transition ${active ? 'border-violet-300/40 bg-violet-400/[0.08]' : 'border-white/[0.06] bg-black/15 hover:border-white/[0.12]'}`}>
      <button type="button" aria-label={`Use ${pattern.name} pattern`} aria-pressed={active} onClick={onApply} className="w-full text-left focus-visible:outline-2 focus-visible:outline-violet-400"><PatternPreview pattern={pattern} /><span className="mt-1.5 block truncate px-0.5 text-[9px] font-medium text-zinc-400">{pattern.name}</span><span className="block px-0.5 font-mono text-[8px] text-zinc-700">{pattern.kind} · {pattern.size}px</span></button>
      {custom && <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">{onExport && <button type="button" aria-label={`Export pattern ${pattern.name}`} onClick={onExport} className="flex size-5 items-center justify-center rounded bg-zinc-950/80 text-[8px] text-zinc-500 hover:text-cyan-200">⇩</button>}{onRemove && <button type="button" aria-label={`Delete pattern ${pattern.name}`} onClick={onRemove} className="flex size-5 items-center justify-center rounded bg-zinc-950/80 text-zinc-500 hover:text-red-300">×</button>}</div>}
    </div>
  )
}

export function PatternsPanel({ pattern, customPatterns, onApplyPattern, onAddPattern, onRemovePattern, onImportPattern, onExportPattern }: {
  pattern: PatternSettings
  customPatterns: PatternPreset[]
  onApplyPattern: (pattern: PatternSettings) => void
  onAddPattern: (name: string, pattern: PatternSettings) => void
  onRemovePattern: (id: string) => void
  onImportPattern: () => void
  onExportPattern: (pattern: PatternPreset) => void
}) {
  const [name, setName] = useState('')
  const matches = (preset: PatternPreset) => pattern.kind === preset.kind && pattern.color === preset.color && pattern.opacity === preset.opacity && pattern.size === preset.size
  const applyPreset = (preset: PatternPreset) => onApplyPattern({ kind: preset.kind, color: preset.color, opacity: preset.opacity, size: preset.size, bitmap: preset.bitmap })
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
      <section className="mt-4"><div className="mb-2 flex items-center justify-between"><h3 className="text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Custom patterns</h3><button type="button" onClick={onImportPattern} className="rounded-md border border-white/[0.07] px-2 py-1 text-[9px] text-zinc-600 hover:text-zinc-200">Import bitmap…</button></div>{customPatterns.length ? <div className="grid grid-cols-2 gap-2">{customPatterns.map((preset) => <PatternRow key={preset.id} pattern={preset} custom active={matches(preset)} onApply={() => applyPreset(preset)} onRemove={() => onRemovePattern(preset.id)} onExport={() => onExportPattern(preset)} />)}</div> : <div className="rounded-lg border border-dashed border-white/[0.07] px-3 py-5 text-center text-[9px] text-zinc-700">Save a procedural pattern or import a bitmap tile to build a local library.</div>}</section>
      <p className="mt-4 text-center text-[9px] leading-relaxed text-zinc-700">Pattern changes are stored in the document and can be undone from History.</p>
    </div>
  )
}

export function ActionsPanel({ onRun }: { onRun: (steps: ActionStep[]) => void }) {
  const [actions, setActions] = useState<ActionPreset[]>(() => {
    try { return normalizeActions(JSON.parse(localStorage.getItem('studio.actions:v1') ?? localStorage.getItem('studio.actions') ?? '[]')) } catch { return [] }
  })
  const [recording, setRecording] = useState(false)
  const [draft, setDraft] = useState<ActionStep[]>([])
  const [name, setName] = useState('My action')
  const [selectedId, setSelectedId] = useState<string | null>(() => actions[0]?.id ?? null)
  const [batching, setBatching] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 })
  const batchInputRef = useRef<HTMLInputElement>(null)
  const batchJobRef = useRef<{ cancelled: boolean; workers: Set<Worker>; rejects: Set<(reason: DOMException) => void> } | null>(null)
  const selected = actions.find((action) => action.id === selectedId) ?? null

  useEffect(() => {
    try { localStorage.setItem('studio.actions:v1', JSON.stringify(actions)) } catch { /* Local action storage is optional. */ }
  }, [actions])

  const cancelBatch = () => {
    const job = batchJobRef.current
    if (!job || job.cancelled) return
    job.cancelled = true
    for (const worker of job.workers) worker.terminate()
    for (const reject of job.rejects) reject(new DOMException('Action batch was cancelled.', 'AbortError'))
    batchJobRef.current = null
    setBatching(false)
  }

  useEffect(() => {
    if (!batching) return
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      cancelBatch()
    }
    window.addEventListener('keydown', keyDown, true)
    return () => window.removeEventListener('keydown', keyDown, true)
  })

  useEffect(() => () => {
    const job = batchJobRef.current
    if (!job) return
    job.cancelled = true
    for (const worker of job.workers) worker.terminate()
    for (const reject of job.rejects) reject(new DOMException('Action batch was cancelled.', 'AbortError'))
    batchJobRef.current = null
  }, [])

  const addStep = (command: ActionCommand) => {
    const step: ActionStep = { id: crypto.randomUUID(), command, enabled: true, condition: 'always' }
    if (recording) setDraft((current) => [...current, step])
    onRun([step])
  }

  const stopRecording = () => {
    setRecording(false)
    if (!draft.length) return
    const action = { id: crypto.randomUUID(), name: name.trim().slice(0, 48) || 'Recorded action', steps: draft }
    setActions((current) => [...current, action])
    setSelectedId(action.id)
    setDraft([])
  }

  const updateStep = (id: string, patch: Partial<ActionStep>) => {
    if (!selected) return
    setActions((current) => current.map((action) => action.id === selected.id ? { ...action, steps: action.steps.map((step) => step.id === id ? { ...step, ...patch } : step) } : action))
  }

  const batchFiles = async (files: FileList | null) => {
    if (!files?.length || !selected) return
    const batchCommands = new Set<ActionCommand>(['invert', 'grayscale', 'sharpen', 'rotate-cw', 'flip-x'])
    const commands = selected.steps.flatMap((step) => step.enabled && batchCommands.has(step.command) ? [step.command] : [])
    if (!commands.length) return
    const batchName = selected.name
    const job = { cancelled: false, workers: new Set<Worker>(), rejects: new Set<(reason: DOMException) => void>() }
    batchJobRef.current = job
    setBatching(true)
    setBatchProgress({ current: 0, total: files.length })
    try {
      let completed = 0
      await Promise.all(Array.from(files).map(async (file) => {
        if (job.cancelled) throw new DOMException('Action batch was cancelled.', 'AbortError')
        const worker = new Worker(new URL('../editor/workers/action-batch.worker.ts', import.meta.url), { type: 'module' })
        job.workers.add(worker)
        const buffer = await file.arrayBuffer()
        if (job.cancelled) throw new DOMException('Action batch was cancelled.', 'AbortError')
        let cancelJob: ((reason: DOMException) => void) | null = null
        const response = await new Promise<{ blob?: Blob; error?: string }>((resolve, reject) => {
          const cancel = (reason: DOMException) => reject(reason)
          cancelJob = cancel
          job.rejects.add(cancel)
          worker.onmessage = (event) => resolve(event.data as { blob?: Blob; error?: string })
          worker.onerror = () => reject(new Error('The batch worker stopped unexpectedly.'))
          worker.postMessage({ data: buffer, type: file.type, commands }, [buffer])
        }).finally(() => {
          worker.terminate()
          job.workers.delete(worker)
          if (cancelJob) job.rejects.delete(cancelJob)
        })
        if (job.cancelled) throw new DOMException('Action batch was cancelled.', 'AbortError')
        if (response.error || !response.blob) throw new Error(response.error || 'The batch worker returned no file.')
        downloadBlob(response.blob, `${file.name.replace(/\.[^.]+$/, '')}-${batchName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`)
        completed += 1
        setBatchProgress({ current: completed, total: files.length })
      }))
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error
    } finally {
      if (batchJobRef.current === job) batchJobRef.current = null
      setBatching(false)
    }
  }

  return (
    <div role="tabpanel" aria-label="Actions" className="min-h-0 flex-1 overflow-y-auto p-3">
      <section className="rounded-lg border border-white/[0.07] bg-black/15 p-2.5">
        <div className="flex gap-2"><input aria-label="Recorded action name" value={name} onChange={(event) => setName(event.target.value)} className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-black/20 px-2 py-1.5 text-[10px] text-zinc-300 outline-none" /><button type="button" onClick={() => recording ? stopRecording() : (setDraft([]), setRecording(true))} className={`rounded-md px-2.5 text-[9px] font-semibold ${recording ? 'bg-red-400/15 text-red-200' : 'border border-white/[0.08] text-zinc-500 hover:text-zinc-200'}`}>{recording ? `Stop · ${draft.length}` : '● Record'}</button></div>
        <p className="mt-2 text-[8px] text-zinc-700">Choose commands below while recording. They execute immediately and are added to the action.</p>
        <div className="mt-2 grid grid-cols-2 gap-1">{(Object.keys(actionCommandLabels) as ActionCommand[]).map((command) => <button key={command} type="button" onClick={() => addStep(command)} className="rounded-md bg-white/[0.03] px-2 py-1.5 text-left text-[8px] text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-200">{actionCommandLabels[command]}</button>)}</div>
      </section>
      <section className="mt-4"><h3 className="mb-2 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Saved actions</h3>{actions.length ? <div className="space-y-1">{actions.map((action) => <button key={action.id} type="button" aria-pressed={selected?.id === action.id} onClick={() => setSelectedId(action.id)} className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[9px] ${selected?.id === action.id ? 'bg-violet-400/12 text-violet-100' : 'bg-white/[0.03] text-zinc-500 hover:text-zinc-200'}`}><span className="truncate">{action.name}</span><span className="font-mono text-[8px] text-zinc-700">{action.steps.length}</span></button>)}</div> : <p className="rounded-lg border border-dashed border-white/[0.07] p-4 text-center text-[9px] text-zinc-700">Record an action to add it here.</p>}</section>
      {selected && <section className="mt-3 rounded-lg border border-white/[0.06] bg-black/10 p-2">
        <div className="flex gap-1"><button type="button" onClick={() => onRun(selected.steps)} className="flex-1 rounded-md bg-violet-500 px-2 py-2 text-[9px] font-semibold text-white">▶ Play</button><button type="button" onClick={() => batching ? cancelBatch() : batchInputRef.current?.click()} className={`rounded-md border px-2 text-[9px] ${batching ? 'border-red-300/20 bg-red-400/[0.08] text-red-200' : 'border-white/[0.08] text-zinc-500'}`}>{batching ? `Cancel ${batchProgress.current}/${batchProgress.total}` : 'Batch files…'}</button><button type="button" aria-label="Delete selected action" onClick={() => { setActions((current) => current.filter((action) => action.id !== selected.id)); setSelectedId(null) }} className="rounded-md px-2 text-zinc-700 hover:text-red-300">×</button></div>
        <div className="mt-2 space-y-1">{selected.steps.map((step, index) => <div key={step.id} className="grid grid-cols-[20px_1fr_90px] items-center gap-1 rounded bg-white/[0.025] p-1"><input aria-label={`Enable step ${index + 1}`} type="checkbox" checked={step.enabled} onChange={(event) => updateStep(step.id, { enabled: event.target.checked })} /><span className="truncate text-[8px] text-zinc-500">{index + 1}. {actionCommandLabels[step.command]}</span><select aria-label={`Condition for step ${index + 1}`} value={step.condition} onChange={(event) => updateStep(step.id, { condition: event.target.value as ActionCondition })} className="rounded border border-white/[0.06] bg-black/20 px-1 py-1 text-[7px] text-zinc-600"><option value="always">Always</option><option value="has-selection">If selected</option><option value="raster-layer">If raster</option><option value="multiple-layers">If multi-layer</option></select></div>)}</div>
      </section>}
      <input ref={batchInputRef} aria-label="Choose files for batch action" type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { void batchFiles(event.target.files); event.target.value = '' }} />
    </div>
  )
}

export function PluginPanelsPanel({ plugins }: { plugins: StudioPlugin[] }) {
  const panels = plugins.flatMap((plugin) => plugin.hooks.panels.map((panel) => ({ ...panel, pluginName: plugin.name, pluginId: plugin.id })))
  return <div role="tabpanel" aria-label="Plugin panels" className="min-h-0 flex-1 overflow-y-auto p-3">{panels.length ? panels.map((panel) => <section key={`${panel.pluginId}:${panel.id}`} className="mb-2 rounded-xl border border-white/[0.07] bg-black/15 p-3"><p className="text-[8px] font-semibold tracking-[0.14em] text-cyan-200/60 uppercase">{panel.pluginName}</p><h3 className="mt-1 text-[11px] font-medium text-zinc-300">{panel.label}</h3><p className="mt-2 text-[9px] leading-relaxed whitespace-pre-wrap text-zinc-600">{panel.description}</p></section>) : <div className="rounded-xl border border-dashed border-white/[0.08] p-6 text-center text-[9px] text-zinc-700">Installed plugin panel hooks appear here.</div>}</div>
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

export function LibrariesPanel({ brushes, activeBrushId, fonts, activeFontFamily, canApplyFont, onBrushChange, onLoadBrush, onRemoveBrush, onExportBrush, onApplyFont, onLoadFont, onRemoveFont }: {
  brushes: BrushPreset[]
  activeBrushId: string
  fonts: CustomFontResource[]
  activeFontFamily?: string
  canApplyFont: boolean
  onBrushChange: (id: string) => void
  onLoadBrush: () => void
  onRemoveBrush: (id: string) => void
  onExportBrush: (brush: BrushPreset) => void
  onApplyFont: (family: string) => void
  onLoadFont: () => void
  onRemoveFont: (id: string) => void
}) {
  const [view, setView] = useState<'brushes' | 'fonts'>('brushes')
  return (
    <div role="tabpanel" aria-label="Libraries" className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/25 p-1">{(['brushes', 'fonts'] as const).map((tab) => <button key={tab} type="button" aria-pressed={view === tab} onClick={() => setView(tab)} className={`rounded-md py-2 text-[9px] font-semibold capitalize transition ${view === tab ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-700 hover:text-zinc-400'}`}>{tab}</button>)}</div>
      {view === 'brushes' && <>
        <div className="mt-4 flex items-center justify-between"><div><h3 className="text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Brush library</h3><p className="mt-1 text-[9px] text-zinc-700">Stored locally in this browser</p></div><button type="button" onClick={onLoadBrush} className="rounded-md border border-white/[0.08] px-2.5 py-1.5 text-[9px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200">+ Import</button></div>
        <div className="mt-3 grid grid-cols-2 gap-2">{brushes.map((brush) => <div key={brush.id} className={`group relative rounded-lg border p-2 transition ${activeBrushId === brush.id ? 'border-violet-300/40 bg-violet-400/[0.08]' : 'border-white/[0.06] bg-black/15 hover:border-white/[0.12]'}`}><button type="button" aria-label={`Use ${brush.name} brush`} aria-pressed={activeBrushId === brush.id} onClick={() => onBrushChange(brush.id)} className="flex w-full flex-col items-center text-center focus-visible:outline-2 focus-visible:outline-violet-400"><BrushThumbnail brush={brush} /><span className="mt-2 block w-full truncate text-[9px] font-medium text-zinc-400">{brush.name}</span><span className="font-mono text-[8px] text-zinc-700">{brush.spacing}% spacing</span></button>{!brush.builtIn && <div className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100"><button type="button" aria-label={`Export brush ${brush.name}`} onClick={() => onExportBrush(brush)} className="flex size-5 items-center justify-center rounded bg-zinc-950/80 text-[8px] text-zinc-500 hover:text-cyan-200">⇩</button><button type="button" aria-label={`Delete brush ${brush.name}`} onClick={() => onRemoveBrush(brush.id)} className="flex size-5 items-center justify-center rounded bg-zinc-950/80 text-zinc-500 hover:text-red-300">×</button></div>}</div>)}</div>
        {brushes.length === 1 && <div className="mt-3 rounded-lg border border-dashed border-white/[0.07] px-3 py-5 text-center text-[9px] leading-relaxed text-zinc-700">Import an ABR pack, PNG, JPEG, WebP, or Studio brush preset to add custom tips.</div>}
      </>}
      {view === 'fonts' && <>
        <div className="mt-4 flex items-center justify-between"><div><h3 className="text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Font library</h3><p className="mt-1 text-[9px] text-zinc-700">TTF, OTF, WOFF, or WOFF2</p></div><button type="button" onClick={onLoadFont} className="rounded-md border border-white/[0.08] px-2.5 py-1.5 text-[9px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200">+ Import</button></div>
        {fonts.length ? <div className="mt-3 space-y-2">{fonts.map((font) => <div key={font.id} className={`group relative rounded-lg border ${activeFontFamily === font.family ? 'border-violet-300/40 bg-violet-400/[0.08]' : 'border-white/[0.06] bg-black/15 hover:border-white/[0.12]'}`}><button type="button" aria-label={`Use ${font.name} font`} aria-pressed={activeFontFamily === font.family} disabled={!canApplyFont} onClick={() => onApplyFont(font.family)} className="w-full p-3 text-left transition focus-visible:outline-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-45"><span style={{ fontFamily: font.family }} className="block truncate text-lg text-zinc-200">Aa Bb Cc</span><span className="mt-1 block truncate text-[9px] text-zinc-500">{font.name}</span></button><button type="button" aria-label={`Delete font ${font.name}`} onClick={() => onRemoveFont(font.id)} className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded bg-zinc-950/80 text-zinc-500 opacity-0 hover:text-red-300 group-hover:opacity-100 focus-visible:opacity-100">×</button></div>)}</div> : <div className="mt-3 rounded-lg border border-dashed border-white/[0.07] px-3 py-5 text-center text-[9px] leading-relaxed text-zinc-700">Import a font to keep it available locally across editing sessions.</div>}
        <p className="mt-4 text-center text-[9px] leading-relaxed text-zinc-700">{canApplyFont ? 'Choose a font to apply it to the selected text layer.' : 'Select a text layer to apply a library font.'}</p>
      </>}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-white/[0.05] py-2.5 last:border-0"><dt className="text-[10px] text-zinc-600">{label}</dt><dd className="text-right font-mono text-[10px] text-zinc-300">{value}</dd></div>
}

function describePixel(red: number, green: number, blue: number, alpha: number) {
  const normalized = [red, green, blue].map((value) => value / 255)
  const maximum = Math.max(...normalized)
  const minimum = Math.min(...normalized)
  const delta = maximum - minimum
  let hue = 0
  if (delta) {
    if (maximum === normalized[0]) hue = 60 * (((normalized[1] - normalized[2]) / delta) % 6)
    else if (maximum === normalized[1]) hue = 60 * ((normalized[2] - normalized[0]) / delta + 2)
    else hue = 60 * ((normalized[0] - normalized[1]) / delta + 4)
  }
  if (hue < 0) hue += 360
  const lightness = (maximum + minimum) / 2
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0
  const black = 1 - maximum
  const denominator = 1 - black
  const cmyk = denominator ? [
    (1 - normalized[0] - black) / denominator,
    (1 - normalized[1] - black) / denominator,
    (1 - normalized[2] - black) / denominator,
    black,
  ] : [0, 0, 0, 1]
  return {
    rgba: `${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)}, ${Math.round(alpha / 255 * 100)}%`,
    hex: `#${[red, green, blue].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`.toUpperCase(),
    hsl: `${Math.round(hue)}°, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%`,
    cmyk: cmyk.map((value) => `${Math.round(value * 100)}%`).join(', '),
  }
}

export function InfoPanel({ sourceCanvasRef, document, assets, selection, zoom, renderer, renderRevision }: {
  sourceCanvasRef: RefObject<HTMLCanvasElement | null>
  document: EditorDocument
  assets: AssetMap
  selection: SelectionState | null
  zoom: number
  renderer: 'canvas2d' | 'webgpu'
  renderRevision: number
}) {
  const size = getDocumentSize(document)
  const [sampleX, setSampleX] = useState(() => Math.floor(size.width / 2))
  const [sampleY, setSampleY] = useState(() => Math.floor(size.height / 2))
  const [sampleSize, setSampleSize] = useState<1 | 3 | 5>(1)
  const [liveSample, setLiveSample] = useState(true)
  const [sample, setSample] = useState(() => describePixel(0, 0, 0, 0))
  const selectedLayer = document.layers.find((layer) => layer.id === document.selectedLayerId)
  const canvas = sourceCanvasRef.current
  const context = canvas?.getContext('2d')
  const bounds = canvas && context && selectedLayer ? getLayerBounds(context, canvas, selectedLayer, assets) : null
  const selectedName = document.groups.find((group) => group.id === document.selectedGroupId)?.name ?? selectedLayer?.name ?? 'None'

  useEffect(() => {
    const source = sourceCanvasRef.current
    if (!source || !liveSample) return
    const update = (event: PointerEvent) => {
      const rect = source.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      setSampleX(Math.max(0, Math.min(source.width - 1, Math.floor((event.clientX - rect.left) / rect.width * source.width))))
      setSampleY(Math.max(0, Math.min(source.height - 1, Math.floor((event.clientY - rect.top) / rect.height * source.height))))
    }
    source.addEventListener('pointermove', update)
    return () => source.removeEventListener('pointermove', update)
  }, [liveSample, sourceCanvasRef])

  useEffect(() => {
    const source = sourceCanvasRef.current
    const context = source?.getContext('2d', { willReadFrequently: true })
    if (!source || !context || source.width === 0 || source.height === 0) return
    const radius = Math.floor(sampleSize / 2)
    const x = Math.max(0, Math.min(source.width - 1, sampleX))
    const y = Math.max(0, Math.min(source.height - 1, sampleY))
    const left = Math.max(0, x - radius)
    const top = Math.max(0, y - radius)
    const width = Math.min(sampleSize, source.width - left)
    const height = Math.min(sampleSize, source.height - top)
    const pixels = context.getImageData(left, top, width, height).data
    const totals = [0, 0, 0, 0]
    for (let offset = 0; offset < pixels.length; offset += 4) {
      totals[0] += pixels[offset]
      totals[1] += pixels[offset + 1]
      totals[2] += pixels[offset + 2]
      totals[3] += pixels[offset + 3]
    }
    const count = Math.max(1, pixels.length / 4)
    setSample(describePixel(totals[0] / count, totals[1] / count, totals[2] / count, totals[3] / count))
  }, [renderRevision, sampleSize, sampleX, sampleY, sourceCanvasRef])

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
      <section className="mt-3 rounded-lg border border-white/[0.07] bg-black/15 p-3">
        <div className="flex items-center justify-between"><h3 className="text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Point sample</h3><label className="flex items-center gap-1.5 text-[8px] text-zinc-600"><input type="checkbox" checked={liveSample} onChange={(event) => setLiveSample(event.target.checked)} className="accent-violet-400" />Live pointer</label></div>
        <div className="mt-3 grid grid-cols-3 gap-2"><label className="text-[8px] text-zinc-600">X<input aria-label="Sample x coordinate" type="number" min="0" max={size.width - 1} value={sampleX} onChange={(event) => setSampleX(Number(event.target.value))} className="mt-1 w-full rounded border border-white/[0.07] bg-zinc-950 px-2 py-1.5 font-mono text-[9px] text-zinc-300" /></label><label className="text-[8px] text-zinc-600">Y<input aria-label="Sample y coordinate" type="number" min="0" max={size.height - 1} value={sampleY} onChange={(event) => setSampleY(Number(event.target.value))} className="mt-1 w-full rounded border border-white/[0.07] bg-zinc-950 px-2 py-1.5 font-mono text-[9px] text-zinc-300" /></label><label className="text-[8px] text-zinc-600">Average<select aria-label="Point sample size" value={sampleSize} onChange={(event) => setSampleSize(Number(event.target.value) as 1 | 3 | 5)} className="mt-1 w-full rounded border border-white/[0.07] bg-zinc-950 px-2 py-1.5 font-mono text-[9px] text-zinc-300"><option value="1">1 × 1</option><option value="3">3 × 3</option><option value="5">5 × 5</option></select></label></div>
        <div className="mt-3 flex items-start gap-3"><span style={{ backgroundColor: sample.hex }} className="mt-1 size-10 shrink-0 rounded-md border border-white/10 shadow-inner" /><dl className="min-w-0 flex-1"><InfoRow label="Hex" value={sample.hex} /><InfoRow label="RGBA" value={sample.rgba} /><InfoRow label="HSL" value={sample.hsl} /><InfoRow label="CMYK" value={sample.cmyk} /></dl></div>
      </section>
    </div>
  )
}
