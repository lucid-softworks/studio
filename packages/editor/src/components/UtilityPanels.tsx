import { useEffect, useRef, type RefObject } from 'react'
import { historyCommandLabel } from '../editor/history-labels'
import { getDocumentSize } from '../editor/presets'
import { getLayerBounds } from '../editor/renderer'
import type { AssetMap } from '../editor/runtime-assets'
import type { SelectionState } from '../editor/selection'
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
