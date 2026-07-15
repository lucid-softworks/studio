import { useEffect, useRef, useState, type ReactNode } from 'react'

type ExportFormat = 'png' | 'jpeg' | 'webp'
type MenuName = 'file' | 'edit'

type MenuBarProps = {
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onAddImage: () => void
  onExport: (format: ExportFormat) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  saving: boolean
  exporting: boolean
}

function MenuItem({ children, shortcut, disabled, onSelect }: { children: ReactNode; shortcut?: string; disabled?: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onSelect} className="flex w-full items-center justify-between gap-8 rounded-md px-2.5 py-1.5 text-left text-[11px] text-zinc-300 outline-none transition hover:bg-violet-400/15 hover:text-white focus-visible:bg-violet-400/15 disabled:pointer-events-none disabled:text-zinc-700">
      <span>{children}</span>{shortcut && <span className="font-mono text-[9px] text-zinc-600">{shortcut}</span>}
    </button>
  )
}

function Separator() {
  return <div role="separator" className="my-1 border-t border-white/[0.07]" />
}

export function MenuBar({ onNew, onOpen, onSave, onAddImage, onExport, onUndo, onRedo, canUndo, canRedo, saving, exporting }: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const pointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenMenu(null)
    }
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null)
        return
      }
      const command = event.metaKey || event.ctrlKey
      if (!command || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        onNew()
      } else if (event.key.toLowerCase() === 'o') {
        event.preventDefault()
        onOpen()
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        onSave()
      }
    }
    window.addEventListener('pointerdown', pointerDown)
    window.addEventListener('keydown', keyDown)
    return () => {
      window.removeEventListener('pointerdown', pointerDown)
      window.removeEventListener('keydown', keyDown)
    }
  }, [onNew, onOpen, onSave])

  const select = (action: () => void) => {
    setOpenMenu(null)
    action()
  }

  const menuButton = (name: MenuName, label: string) => (
    <button type="button" aria-haspopup="menu" aria-expanded={openMenu === name} onClick={() => setOpenMenu((current) => current === name ? null : name)} onPointerEnter={() => { if (openMenu) setOpenMenu(name) }} className={`rounded-md px-2 py-1.5 text-[11px] outline-none transition ${openMenu === name ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200'}`}>{label}</button>
  )

  return (
    <div ref={rootRef} className="relative ml-1 flex h-full items-center border-l border-white/[0.07] pl-2">
      {menuButton('file', 'File')}
      {menuButton('edit', 'Edit')}

      {openMenu === 'file' && (
        <div role="menu" aria-label="File menu" className="absolute top-[calc(100%-10px)] left-2 z-[70] w-60 rounded-xl border border-white/[0.1] bg-[#18181b]/98 p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.65)] backdrop-blur-xl">
          <MenuItem shortcut="⌘N" onSelect={() => select(onNew)}>New document</MenuItem>
          <MenuItem shortcut="⌘O" onSelect={() => select(onOpen)}>Open…</MenuItem>
          <Separator />
          <MenuItem onSelect={() => select(onAddImage)}>Place image as layer…</MenuItem>
          <Separator />
          <MenuItem shortcut="⌘S" disabled={saving} onSelect={() => select(onSave)}>{saving ? 'Saving project…' : 'Save Studio project'}</MenuItem>
          <Separator />
          <p className="px-2.5 py-1 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Export as</p>
          <MenuItem disabled={exporting} onSelect={() => select(() => onExport('png'))}>PNG image</MenuItem>
          <MenuItem disabled={exporting} onSelect={() => select(() => onExport('jpeg'))}>JPEG image</MenuItem>
          <MenuItem disabled={exporting} onSelect={() => select(() => onExport('webp'))}>WebP image</MenuItem>
        </div>
      )}

      {openMenu === 'edit' && (
        <div role="menu" aria-label="Edit menu" className="absolute top-[calc(100%-10px)] left-12 z-[70] w-52 rounded-xl border border-white/[0.1] bg-[#18181b]/98 p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.65)] backdrop-blur-xl">
          <MenuItem shortcut="⌘Z" disabled={!canUndo} onSelect={() => select(onUndo)}>Undo</MenuItem>
          <MenuItem shortcut="⇧⌘Z" disabled={!canRedo} onSelect={() => select(onRedo)}>Redo</MenuItem>
        </div>
      )}
    </div>
  )
}
