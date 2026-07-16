import { useMemo, useReducer } from 'react'
import { ModalDialog } from './ModalDialog'

export type PaletteCommand = {
  id: string
  label: string
  category: string
  keywords?: string
  shortcut?: string
  disabled?: boolean
  run: () => void
}

export function CommandPalette({ commands, onClose }: { commands: PaletteCommand[]; onClose: () => void }) {
  const [{ query, active }, update] = useReducer((state: { query: string; active: number }, patch: Partial<{ query: string; active: number }>) => ({ ...state, ...patch }), { query: '', active: 0 })
  const results = useMemo(() => {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
    return commands.filter((command) => terms.every((term) => `${command.label} ${command.category} ${command.keywords ?? ''}`.toLocaleLowerCase().includes(term))).slice(0, 60)
  }, [commands, query])

  const invoke = (command: PaletteCommand | undefined) => {
    if (!command || command.disabled) return
    onClose()
    command.run()
  }

  return <ModalDialog label="Command palette" onDismiss={onClose} className="z-[110] flex items-start justify-center bg-black/65 px-4 pt-[12vh] backdrop-blur-sm"><section className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.12] bg-[#17171a]/98 shadow-[0_32px_120px_rgba(0,0,0,0.75)]"><input aria-label="Search commands" value={query} onChange={(event) => update({ query: event.target.value, active: 0 })} onKeyDown={(event) => {
    if (event.key === 'Escape') onClose()
    else if (event.key === 'ArrowDown') { event.preventDefault(); update({ active: Math.min(results.length - 1, active + 1) }) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); update({ active: Math.max(0, active - 1) }) }
    else if (event.key === 'Enter') { event.preventDefault(); invoke(results[active]) }
  }} placeholder="Search tools, menus, and actions…" className="w-full border-b border-white/[0.08] bg-transparent px-5 py-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-700" /><div role="listbox" aria-label="Matching commands" className="max-h-[52vh] overflow-y-auto p-2">{results.length ? results.map((command, index) => <button type="button" key={command.id} role="option" aria-selected={index === active} disabled={command.disabled} onMouseEnter={() => update({ active: index })} onClick={() => invoke(command)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left disabled:opacity-30 ${index === active ? 'bg-violet-400/15 text-white' : 'text-zinc-400 hover:bg-white/[0.04]'}`}><span className="w-20 shrink-0 text-[8px] font-semibold tracking-wide text-zinc-700 uppercase">{command.category}</span><span className="min-w-0 flex-1 truncate text-[11px]">{command.label}</span>{command.shortcut && <kbd className="rounded border border-white/[0.08] bg-black/20 px-1.5 py-0.5 font-mono text-[9px] text-zinc-600">{command.shortcut}</kbd>}</button>) : <p className="px-4 py-10 text-center text-[11px] text-zinc-700">No matching commands</p>}</div><footer className="flex gap-4 border-t border-white/[0.06] px-4 py-2 text-[8px] text-zinc-700"><span>↑↓ Navigate</span><span>↵ Run</span><span>Esc Close</span><span className="ml-auto">{results.length} result{results.length === 1 ? '' : 's'}</span></footer></section></ModalDialog>
}
