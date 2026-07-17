import { downloadBlob } from '../editor/download'
import { measurementMetrics, measurementsCsv } from '../editor/measurements'
import type { DocumentMeasurement, DocumentMeasurementScale } from '../editor/types'
import { ModalDialog } from './ModalDialog'

type Props = {
  measurements: readonly DocumentMeasurement[]
  scale: DocumentMeasurementScale
  onMeasurementsChange: (measurements: DocumentMeasurement[]) => void
  onScaleChange: (scale: DocumentMeasurementScale) => void
  onClose: () => void
}

export function MeasurementLogDialog({ measurements, scale, onMeasurementsChange, onScaleChange, onClose }: Props) {
  const patchScale = (patch: Partial<DocumentMeasurementScale>) => onScaleChange({ ...scale, ...patch })
  const update = (id: string, patch: Partial<DocumentMeasurement>) => onMeasurementsChange(measurements.map((measurement) => measurement.id === id ? { ...measurement, ...patch } : measurement))
  const exportCsv = () => downloadBlob(new Blob([measurementsCsv(measurements, scale)], { type: 'text/csv;charset=utf-8' }), 'studio-measurements.csv')

  return (
    <ModalDialog label="Measurement log" onDismiss={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <section className="flex max-h-[min(760px,calc(100dvh-32px))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#17171a] shadow-2xl">
          <header className="flex items-start justify-between border-b border-white/[0.08] px-5 py-4"><div><h2 className="text-sm font-semibold text-zinc-100">Measurement log</h2><p className="mt-1 text-[10px] text-zinc-600">Persistent document measurements with a shared calibration scale.</p></div><button type="button" aria-label="Close measurement log" onClick={onClose} className="flex size-8 items-center justify-center rounded text-zinc-600 hover:bg-white/[0.05] hover:text-white">×</button></header>
          <div className="grid grid-cols-2 gap-3 border-b border-white/[0.07] px-5 py-4"><label className="text-[9px] text-zinc-600">Pixels per unit<input aria-label="Measurement pixels per unit" type="number" min="0.000001" step="0.1" value={scale.pixelsPerUnit} onChange={(event) => patchScale({ pixelsPerUnit: Math.max(0.000001, Number(event.target.value) || 1) })} className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 font-mono text-[11px] text-zinc-200 outline-none" /></label><label className="text-[9px] text-zinc-600">Unit<input aria-label="Measurement unit" maxLength={16} value={scale.unit} onChange={(event) => patchScale({ unit: event.target.value.slice(0, 16) || 'px' })} className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-[11px] text-zinc-200 outline-none" /></label></div>
          <div className="min-h-0 flex-1 overflow-auto p-5">
            {measurements.length ? <div className="space-y-2">{measurements.map((measurement, index) => { const metrics = measurementMetrics(measurement, scale); return <article key={measurement.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-white/[0.06] bg-black/15 p-3"><label className="min-w-0 text-[8px] text-zinc-700 uppercase">Record {index + 1}<input aria-label={`Measurement ${index + 1} name`} value={measurement.name} onChange={(event) => update(measurement.id, { name: event.target.value })} className="mt-1 block w-full bg-transparent text-[11px] font-medium normal-case text-zinc-300 outline-none" /></label><dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[8px]"><div><dt className="text-zinc-700">Length</dt><dd className="font-mono text-zinc-400">{metrics.value.toFixed(3)} {scale.unit}</dd></div><div><dt className="text-zinc-700">Angle</dt><dd className="font-mono text-zinc-400">{metrics.angle.toFixed(2)}°</dd></div><div><dt className="text-zinc-700">Pixels</dt><dd className="font-mono text-zinc-500">{metrics.pixels.toFixed(1)}</dd></div><div><dt className="text-zinc-700">Δ x / y</dt><dd className="font-mono text-zinc-500">{metrics.deltaX.toFixed(0)} / {metrics.deltaY.toFixed(0)}</dd></div></dl><button type="button" aria-label={`Delete ${measurement.name}`} onClick={() => onMeasurementsChange(measurements.filter((candidate) => candidate.id !== measurement.id))} className="flex size-7 items-center justify-center rounded text-zinc-700 hover:bg-red-400/10 hover:text-red-300">×</button></article> })}</div> : <div className="rounded-xl border border-dashed border-white/[0.07] px-4 py-12 text-center text-[10px] text-zinc-700">Draw with the Measure tool, then choose Save measurement.</div>}
          </div>
          <footer className="flex items-center justify-between border-t border-white/[0.07] px-5 py-3"><button type="button" disabled={!measurements.length} onClick={() => onMeasurementsChange([])} className="rounded-lg px-3 py-2 text-[10px] text-zinc-600 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-30">Clear log</button><div className="flex gap-2"><button type="button" disabled={!measurements.length} onClick={exportCsv} className="rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] text-zinc-400 hover:text-white disabled:opacity-30">Export CSV</button><button type="button" onClick={onClose} className="rounded-lg bg-violet-500 px-4 py-2 text-[10px] font-semibold text-white">Done</button></div></footer>
        </section>
      </div>
    </ModalDialog>
  )
}
