import { useState } from 'react'
import type { VectorizeOptions } from '../editor/vectorize'
import { ModalDialog } from './ModalDialog'

const defaults: VectorizeOptions = { mode: 'monochrome', threshold: 128, colorCount: 6, smoothing: 35, cornerThreshold: 55, noise: 2, monochromeColor: '#111111' }

type Props = { layerName: string; onTrace: (options: VectorizeOptions) => Promise<void>; onClose: () => void }

export function VectorizeDialog({ layerName, onTrace, onClose }: Props) {
  const [options, setOptions] = useState(defaults)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const patch = (next: Partial<VectorizeOptions>) => setOptions((current) => ({ ...current, ...next }))
  const dismiss = () => { if (!processing) onClose() }
  const trace = async () => {
    setProcessing(true)
    setError('')
    try { await onTrace(options) } catch (reason) { setError(reason instanceof Error ? reason.message : 'The bitmap could not be traced.'); setProcessing(false) }
  }

  return (
    <ModalDialog label="Vectorize bitmap" onDismiss={dismiss}>
      <div className="flex min-h-full items-center justify-center p-4">
        <section className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.1] bg-[#17171a] shadow-2xl">
          <header className="flex items-start justify-between border-b border-white/[0.08] px-5 py-4"><div><h2 className="text-sm font-semibold text-zinc-100">Vectorize bitmap</h2><p className="mt-1 text-[10px] text-zinc-600">Trace {layerName} into editable compound shape layers.</p></div><button type="button" aria-label="Close vectorize bitmap" disabled={processing} onClick={onClose} className="flex size-8 items-center justify-center rounded text-zinc-600 hover:bg-white/[0.05] hover:text-white disabled:opacity-30">×</button></header>
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/[0.06] bg-black/15 p-1"><button type="button" aria-pressed={options.mode === 'monochrome'} onClick={() => patch({ mode: 'monochrome' })} className={`rounded-md px-3 py-2 text-[10px] ${options.mode === 'monochrome' ? 'bg-violet-400/15 text-violet-200' : 'text-zinc-600 hover:text-zinc-300'}`}>Monochrome</button><button type="button" aria-pressed={options.mode === 'color'} onClick={() => patch({ mode: 'color' })} className={`rounded-md px-3 py-2 text-[10px] ${options.mode === 'color' ? 'bg-violet-400/15 text-violet-200' : 'text-zinc-600 hover:text-zinc-300'}`}>Color</button></div>
            {options.mode === 'monochrome' ? <div className="grid grid-cols-[1fr_auto] gap-4"><Range label="Threshold" value={options.threshold} minimum={0} maximum={255} onChange={(threshold) => patch({ threshold })} /><label className="text-[9px] text-zinc-600">Fill<input aria-label="Vector fill color" type="color" value={options.monochromeColor} onChange={(event) => patch({ monochromeColor: event.target.value })} className="mt-1 block size-8 cursor-pointer rounded border-0 bg-transparent p-0" /></label></div> : <Range label="Colors" value={options.colorCount} minimum={2} maximum={16} onChange={(colorCount) => patch({ colorCount })} />}
            <Range label="Smoothing" value={options.smoothing} minimum={0} maximum={100} suffix="%" onChange={(smoothing) => patch({ smoothing })} />
            <Range label="Corner threshold" value={options.cornerThreshold} minimum={0} maximum={100} suffix="%" onChange={(cornerThreshold) => patch({ cornerThreshold })} />
            <Range label="Noise removal" value={options.noise} minimum={0} maximum={100} suffix="%" onChange={(noise) => patch({ noise })} />
            <p className="rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2 text-[9px] leading-relaxed text-zinc-600">Tracing runs locally in a worker. Color mode creates one editable shape layer per quantized color; holes become subtract paths.</p>
            {error && <p role="alert" className="text-[10px] text-red-300">{error}</p>}
          </div>
          <footer className="flex justify-end gap-2 border-t border-white/[0.07] px-5 py-3"><button type="button" disabled={processing} onClick={onClose} className="rounded-lg px-3 py-2 text-[10px] text-zinc-500 hover:text-zinc-200 disabled:opacity-30">Cancel</button><button type="button" disabled={processing} onClick={() => void trace()} className="rounded-lg bg-violet-500 px-4 py-2 text-[10px] font-semibold text-white disabled:opacity-50">{processing ? 'Tracing…' : 'Create shapes'}</button></footer>
        </section>
      </div>
    </ModalDialog>
  )
}

function Range({ label, value, minimum, maximum, suffix = '', onChange }: { label: string; value: number; minimum: number; maximum: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="block text-[9px] text-zinc-600"><span className="flex justify-between"><span>{label}</span><span className="font-mono text-zinc-500">{value}{suffix}</span></span><input aria-label={`Vector ${label.toLowerCase()}`} type="range" min={minimum} max={maximum} value={value} onChange={(event) => onChange(Number(event.target.value))} className="studio-range mt-2 w-full" /></label>
}
