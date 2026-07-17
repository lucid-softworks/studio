import type { DocumentNote } from '../editor/types'
import { ModalDialog } from './ModalDialog'

type Props = {
  notes: readonly DocumentNote[]
  onChange: (notes: DocumentNote[]) => void
  onClose: () => void
}

export function NotesDialog({ notes, onChange, onClose }: Props) {
  const update = (id: string, patch: Partial<DocumentNote>) => onChange(notes.map((note) => note.id === id ? { ...note, ...patch } : note))

  return (
    <ModalDialog label="Notes and annotations" onDismiss={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <section className="flex max-h-[min(780px,calc(100dvh-32px))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#17171a] shadow-2xl">
          <header className="flex items-start justify-between border-b border-white/[0.08] px-5 py-4">
            <div><h2 className="text-sm font-semibold text-zinc-100">Notes and annotations</h2><p className="mt-1 text-[10px] text-zinc-600">Document notes round-trip through Studio projects and Photoshop text annotations in PSD/PSB.</p></div>
            <button type="button" aria-label="Close notes" onClick={onClose} className="flex size-8 items-center justify-center rounded text-zinc-600 hover:bg-white/[0.05] hover:text-white">×</button>
          </header>
          <div className="min-h-0 flex-1 overflow-auto p-5">
            {notes.length ? <div className="space-y-3">{notes.map((note, index) => (
              <article key={note.id} className="rounded-xl border border-white/[0.07] bg-black/15 p-4">
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                  <input aria-label={`Note ${index + 1} color`} type="color" value={note.color} onChange={(event) => update(note.id, { color: event.target.value })} className="size-8 cursor-pointer rounded border-0 bg-transparent p-0" />
                  <input aria-label={`Note ${index + 1} title`} value={note.title} maxLength={80} onChange={(event) => update(note.id, { title: event.target.value })} className="min-w-0 bg-transparent text-[11px] font-semibold text-zinc-300 outline-none" />
                  <button type="button" aria-label={`Delete ${note.title}`} onClick={() => onChange(notes.filter((candidate) => candidate.id !== note.id))} className="flex size-7 items-center justify-center rounded text-zinc-700 hover:bg-red-400/10 hover:text-red-300">×</button>
                </div>
                <textarea aria-label={`Note ${index + 1} content`} value={note.content} maxLength={100_000} placeholder="Write a note…" onChange={(event) => update(note.id, { content: event.target.value })} className="mt-3 min-h-24 w-full resize-y rounded-lg border border-white/[0.06] bg-black/20 p-3 text-[10px] leading-relaxed text-zinc-400 outline-none placeholder:text-zinc-800" />
                <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-center gap-3">
                  <label className="text-[8px] text-zinc-700">Author<input aria-label={`Note ${index + 1} author`} value={note.author} maxLength={80} onChange={(event) => update(note.id, { author: event.target.value })} className="mt-1 block w-full bg-transparent text-[10px] text-zinc-500 outline-none" /></label>
                  <span className="font-mono text-[8px] text-zinc-700">x {note.x.toFixed(1)} · y {note.y.toFixed(1)}</span>
                  <label className="flex items-center gap-1.5 text-[9px] text-zinc-600"><input type="checkbox" checked={note.open} onChange={(event) => update(note.id, { open: event.target.checked })} />Open popup</label>
                </div>
              </article>
            ))}</div> : <div className="rounded-xl border border-dashed border-white/[0.07] px-4 py-12 text-center text-[10px] text-zinc-700">Choose the Note tool and click the canvas to place an annotation.</div>}
          </div>
          <footer className="flex items-center justify-between border-t border-white/[0.07] px-5 py-3"><button type="button" disabled={!notes.length} onClick={() => onChange([])} className="rounded-lg px-3 py-2 text-[10px] text-zinc-600 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-30">Clear notes</button><button type="button" onClick={onClose} className="rounded-lg bg-violet-500 px-4 py-2 text-[10px] font-semibold text-white">Done</button></footer>
        </section>
      </div>
    </ModalDialog>
  )
}
