import { useMemo, useState } from 'react'
import { formatCapabilities, type FormatCapability } from '../editor/format-capabilities'
import type { PsdCompatibilityStatus } from '../editor/psd-compatibility'
import { ModalDialog } from './ModalDialog'

const statusLabel: Record<PsdCompatibilityStatus, string> = {
  editable: 'Editable',
  partial: 'Partial',
  preserved: 'Preserved',
  converted: 'Converted',
  rasterized: 'Rasterized',
  unsupported: 'Unsupported',
}

const statusClass: Record<PsdCompatibilityStatus, string> = {
  editable: 'border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200',
  partial: 'border-amber-300/20 bg-amber-300/[0.07] text-amber-200',
  preserved: 'border-cyan-300/20 bg-cyan-300/[0.07] text-cyan-200',
  converted: 'border-blue-300/20 bg-blue-300/[0.07] text-blue-200',
  rasterized: 'border-fuchsia-300/20 bg-fuchsia-300/[0.07] text-fuchsia-200',
  unsupported: 'border-zinc-500/20 bg-zinc-500/[0.07] text-zinc-500',
}

function StatusBadge({ value }: { value: PsdCompatibilityStatus }) {
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[8px] font-semibold tracking-wide uppercase ${statusClass[value]}`}>{statusLabel[value]}</span>
}

function matches(entry: FormatCapability, query: string) {
  const normalized = query.trim().toLowerCase()
  return !normalized || [entry.label, entry.id, entry.detail, ...entry.extensions].some((value) => value.toLowerCase().includes(normalized))
}

export function FormatCapabilityDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const visibleFormats = useMemo(() => formatCapabilities.filter((entry) => matches(entry, query)), [query])

  return (
    <ModalDialog label="Format compatibility" onDismiss={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <section className="flex max-h-[min(820px,calc(100dvh-32px))] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#17171a] shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-5 py-4">
            <div><h2 className="text-sm font-semibold text-zinc-100">Format compatibility</h2><p className="mt-1 max-w-2xl text-[10px] leading-relaxed text-zinc-600">See what remains editable, what Studio only preserves, and what will be converted or flattened before opening or exporting.</p></div>
            <button type="button" aria-label="Close format compatibility" onClick={onClose} className="flex size-8 shrink-0 items-center justify-center rounded text-zinc-600 hover:bg-white/[0.05] hover:text-white">×</button>
          </header>
          <div className="border-b border-white/[0.07] px-5 py-3">
            <label className="block text-[9px] text-zinc-600">Filter formats<input aria-label="Filter formats" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="PSD, RAW, editable…" className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-violet-300/30" /></label>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            <table className="w-full table-fixed border-separate border-spacing-y-1 text-left">
              <thead><tr className="text-[8px] font-semibold tracking-[0.14em] text-zinc-700 uppercase"><th className="w-[28%] px-3 py-1">Format</th><th className="w-24 px-3 py-1">Import</th><th className="w-24 px-3 py-1">Export</th><th className="px-3 py-1">Behavior</th></tr></thead>
              <tbody>{visibleFormats.map((entry) => <tr key={entry.id} className="align-top text-[10px]"><th scope="row" className="rounded-l-lg border-y border-l border-white/[0.06] bg-black/15 px-3 py-3 font-medium text-zinc-300"><span className="block">{entry.label}</span><span className="mt-1 block font-mono text-[8px] font-normal text-zinc-700">{entry.extensions.join(' · ')}</span></th><td className="border-y border-white/[0.06] bg-black/15 px-3 py-3"><StatusBadge value={entry.import} /></td><td className="border-y border-white/[0.06] bg-black/15 px-3 py-3"><StatusBadge value={entry.export} /></td><td className="rounded-r-lg border-y border-r border-white/[0.06] bg-black/15 px-3 py-3 leading-relaxed text-zinc-500">{entry.detail}</td></tr>)}</tbody>
            </table>
            {!visibleFormats.length && <p className="py-12 text-center text-[10px] text-zinc-700">No formats match “{query}”.</p>}
          </div>
          <footer className="flex items-center justify-between gap-4 border-t border-white/[0.07] px-5 py-3"><p className="text-[8px] text-zinc-700">All decoding, conversion, and export runs locally on this device.</p><button type="button" onClick={onClose} className="rounded-lg bg-violet-500 px-4 py-2 text-[10px] font-semibold text-white hover:bg-violet-400">Done</button></footer>
        </section>
      </div>
    </ModalDialog>
  )
}
