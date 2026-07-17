import { countsCsv, countMarkerNumber } from '../editor/counts'
import { downloadBlob } from '../editor/download'
import { createId } from '../editor/presets'
import type { DocumentCounts } from '../editor/types'
import { ModalDialog } from './ModalDialog'

const groupColors = ['#facc15', '#22d3ee', '#fb7185', '#a78bfa', '#4ade80', '#fb923c']

type Props = {
  counts: DocumentCounts
  onChange: (counts: DocumentCounts) => void
  onClose: () => void
}

export function CountLogDialog({ counts, onChange, onClose }: Props) {
  const updateGroup = (id: string, patch: Partial<DocumentCounts['groups'][number]>) => {
    onChange({ ...counts, groups: counts.groups.map((group) => group.id === id ? { ...group, ...patch } : group) })
  }
  const updateMarker = (id: string, label: string) => {
    onChange({ ...counts, markers: counts.markers.map((marker) => marker.id === id ? { ...marker, label } : marker) })
  }
  const addGroup = () => {
    const id = createId()
    const group = { id, name: `Count group ${counts.groups.length + 1}`, color: groupColors[counts.groups.length % groupColors.length] }
    onChange({ ...counts, groups: [...counts.groups, group], activeGroupId: id })
  }
  const removeGroup = (id: string) => {
    if (counts.groups.length === 1) return
    const groups = counts.groups.filter((group) => group.id !== id)
    onChange({ groups, markers: counts.markers.filter((marker) => marker.groupId !== id), activeGroupId: counts.activeGroupId === id ? groups[0].id : counts.activeGroupId })
  }
  const exportCsv = () => downloadBlob(new Blob([countsCsv(counts)], { type: 'text/csv;charset=utf-8' }), 'studio-counts.csv')

  return (
    <ModalDialog label="Count records" onDismiss={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <section className="flex max-h-[min(780px,calc(100dvh-32px))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#17171a] shadow-2xl">
          <header className="flex items-start justify-between border-b border-white/[0.08] px-5 py-4">
            <div><h2 className="text-sm font-semibold text-zinc-100">Count records</h2><p className="mt-1 text-[10px] text-zinc-600">Persistent, labelled markers organised into independent count groups.</p></div>
            <button type="button" aria-label="Close count records" onClick={onClose} className="flex size-8 items-center justify-center rounded text-zinc-600 hover:bg-white/[0.05] hover:text-white">×</button>
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-5">
            {counts.groups.map((group) => {
              const markers = counts.markers.filter((marker) => marker.groupId === group.id)
              return (
                <section key={group.id} className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/15">
                  <header className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 border-b border-white/[0.06] p-3">
                    <input aria-label={`${group.name} color`} type="color" value={group.color} onChange={(event) => updateGroup(group.id, { color: event.target.value })} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" />
                    <input aria-label={`${group.name} name`} value={group.name} maxLength={64} onChange={(event) => updateGroup(group.id, { name: event.target.value })} className="min-w-0 bg-transparent text-[11px] font-semibold text-zinc-300 outline-none" />
                    <span className="font-mono text-[9px] text-zinc-600">{markers.length}</span>
                    <button type="button" aria-label={`Delete ${group.name}`} disabled={counts.groups.length === 1} onClick={() => removeGroup(group.id)} className="flex size-7 items-center justify-center rounded text-zinc-700 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-20">×</button>
                  </header>
                  {markers.length ? <div className="divide-y divide-white/[0.04]">{markers.map((marker) => (
                    <article key={marker.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3 py-2">
                      <span className="flex size-6 items-center justify-center rounded-full font-mono text-[9px] font-bold text-zinc-950" style={{ backgroundColor: group.color }}>{countMarkerNumber(counts.markers, marker)}</span>
                      <input aria-label={`Count marker ${countMarkerNumber(counts.markers, marker)} label`} value={marker.label} maxLength={80} placeholder="Add label" onChange={(event) => updateMarker(marker.id, event.target.value)} className="min-w-0 bg-transparent text-[10px] text-zinc-400 outline-none placeholder:text-zinc-800" />
                      <span className="font-mono text-[8px] text-zinc-700">{marker.x.toFixed(1)}, {marker.y.toFixed(1)}</span>
                      <button type="button" aria-label={`Delete count marker ${countMarkerNumber(counts.markers, marker)}`} onClick={() => onChange({ ...counts, markers: counts.markers.filter((candidate) => candidate.id !== marker.id) })} className="flex size-6 items-center justify-center rounded text-zinc-700 hover:bg-red-400/10 hover:text-red-300">×</button>
                    </article>
                  ))}</div> : <p className="px-3 py-5 text-center text-[9px] text-zinc-700">Select this group and click the canvas with the Count tool.</p>}
                </section>
              )
            })}
          </div>
          <footer className="flex items-center justify-between border-t border-white/[0.07] px-5 py-3">
            <div className="flex gap-2"><button type="button" onClick={addGroup} className="rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] text-zinc-400 hover:text-white">New group</button><button type="button" disabled={!counts.markers.length} onClick={() => onChange({ ...counts, markers: [] })} className="rounded-lg px-3 py-2 text-[10px] text-zinc-600 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-30">Clear markers</button></div>
            <div className="flex gap-2"><button type="button" disabled={!counts.markers.length} onClick={exportCsv} className="rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] text-zinc-400 hover:text-white disabled:opacity-30">Export CSV</button><button type="button" onClick={onClose} className="rounded-lg bg-violet-500 px-4 py-2 text-[10px] font-semibold text-white">Done</button></div>
          </footer>
        </section>
      </div>
    </ModalDialog>
  )
}
