import { useEffect, useMemo, useState } from 'react'

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
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const results = useMemo(() => {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
    return commands.filter((command) => terms.every((term) => `${command.label} ${command.category} ${command.keywords ?? ''}`.toLocaleLowerCase().includes(term))).slice(0, 60)
  }, [commands, query])

  useEffect(() => setActive(0), [query])
  const invoke = (command: PaletteCommand | undefined) => {
    if (!command || command.disabled) return
    onClose()
    command.run()
  }

  return <div role="dialog" aria-modal="true" aria-label="Command palette" className="fixed inset-0 z-[110] flex items-start justify-center bg-black/65 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.12] bg-[#17171a]/98 shadow-[0_32px_120px_rgba(0,0,0,0.75)]"><input autoFocus aria-label="Search commands" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
    if (event.key === 'Escape') onClose()
    else if (event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => Math.min(results.length - 1, value + 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(0, value - 1)) }
    else if (event.key === 'Enter') { event.preventDefault(); invoke(results[active]) }
  }} placeholder="Search tools, menus, and actions…" className="w-full border-b border-white/[0.08] bg-transparent px-5 py-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-700" /><div role="listbox" aria-label="Matching commands" className="max-h-[52vh] overflow-y-auto p-2">{results.length ? results.map((command, index) => <button key={command.id} role="option" aria-selected={index === active} disabled={command.disabled} onMouseEnter={() => setActive(index)} onClick={() => invoke(command)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left disabled:opacity-30 ${index === active ? 'bg-violet-400/15 text-white' : 'text-zinc-400 hover:bg-white/[0.04]'}`}><span className="w-20 shrink-0 text-[8px] font-semibold tracking-wide text-zinc-700 uppercase">{command.category}</span><span className="min-w-0 flex-1 truncate text-[11px]">{command.label}</span>{command.shortcut && <kbd className="rounded border border-white/[0.08] bg-black/20 px-1.5 py-0.5 font-mono text-[9px] text-zinc-600">{command.shortcut}</kbd>}</button>) : <p className="px-4 py-10 text-center text-[11px] text-zinc-700">No matching commands</p>}</div><footer className="flex gap-4 border-t border-white/[0.06] px-4 py-2 text-[8px] text-zinc-700"><span>↑↓ Navigate</span><span>↵ Run</span><span>Esc Close</span><span className="ml-auto">{results.length} result{results.length === 1 ? '' : 's'}</span></footer></section></div>
}
