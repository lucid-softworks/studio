import { useEffect, useRef, useState, type ReactNode } from 'react'

type ExportFormat = 'png' | 'jpeg' | 'webp'
type MenuName = 'file' | 'edit' | 'image' | 'layer' | 'select' | 'filter' | 'view'

type MenuBarProps = {
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onAddImage: () => void
  onExport: (format: ExportFormat) => void
  onUndo: () => void
  onRedo: () => void
  onRotateCanvas: (direction: 'cw' | 'ccw') => void
  onFlipCanvas: (axis: 'x' | 'y') => void
  onNewLayer: () => void
  onNewGroup: () => void
  onDuplicateLayer: () => void
  onRasterizeLayer: () => void
  onDeleteLayer: () => void
  onSelectAll: () => void
  onDeselect: () => void
  onInvertSelection: () => void
  onFeatherSelection: () => void
  onExpandSelection: () => void
  onContractSelection: () => void
  onFilter: (preset: 'blur' | 'sharpen' | 'grayscale' | 'sepia' | 'invert' | 'reset') => void
  onZoom: (command: 'in' | 'out' | 'actual') => void
  canUndo: boolean
  canRedo: boolean
  hasLayerSelection: boolean
  canRasterize: boolean
  hasPixelSelection: boolean
  hasFilterTarget: boolean
  saving: boolean
  exporting: boolean
}

function MenuItem({ children, shortcut, disabled, onSelect }: { children: ReactNode; shortcut?: string; disabled?: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onSelect} className="flex w-full items-center justify-between gap-8 rounded-md px-2.5 py-1.5 text-left text-[11px] whitespace-nowrap text-zinc-300 outline-none transition hover:bg-violet-400/15 hover:text-white focus-visible:bg-violet-400/15 disabled:pointer-events-none disabled:text-zinc-700">
      <span>{children}</span>{shortcut && <span className="font-mono text-[9px] text-zinc-600">{shortcut}</span>}
    </button>
  )
}

function Separator() {
  return <div role="separator" className="my-1 border-t border-white/[0.07]" />
}

export function MenuBar(props: MenuBarProps) {
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
      const key = event.key.toLowerCase()
      if (key === 'n') {
        if (event.shiftKey) props.onNewLayer()
        else props.onNew()
      } else if (key === 'o') props.onOpen()
      else if (key === 's') props.onSave()
      else if (key === '0') props.onZoom('actual')
      else if (key === '=' || key === '+') props.onZoom('in')
      else if (key === '-') props.onZoom('out')
      else return
      event.preventDefault()
    }
    window.addEventListener('pointerdown', pointerDown)
    window.addEventListener('keydown', keyDown)
    return () => {
      window.removeEventListener('pointerdown', pointerDown)
      window.removeEventListener('keydown', keyDown)
    }
  }, [props])

  const select = (action: () => void) => {
    setOpenMenu(null)
    action()
  }

  const menu = (name: MenuName, label: string, children: ReactNode, width = 'w-56') => (
    <div className="relative h-full content-center" onPointerEnter={() => { if (openMenu) setOpenMenu(name) }}>
      <button type="button" aria-haspopup="menu" aria-expanded={openMenu === name} onClick={() => setOpenMenu((current) => current === name ? null : name)} className={`rounded-md px-2 py-1.5 text-[11px] outline-none transition ${openMenu === name ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200'}`}>{label}</button>
      {openMenu === name && <div role="menu" aria-label={`${label} menu`} className={`absolute top-[calc(100%-6px)] left-0 z-[70] ${width} rounded-xl border border-white/[0.1] bg-[#18181b]/98 p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.65)] backdrop-blur-xl`}>{children}</div>}
    </div>
  )

  return (
    <div ref={rootRef} className="ml-1 flex h-full items-center border-l border-white/[0.07] pl-2">
      {menu('file', 'File', <>
        <MenuItem shortcut="⌘N" onSelect={() => select(props.onNew)}>New document</MenuItem>
        <MenuItem shortcut="⌘O" onSelect={() => select(props.onOpen)}>Open…</MenuItem>
        <Separator />
        <MenuItem onSelect={() => select(props.onAddImage)}>Place image as layer…</MenuItem>
        <Separator />
        <MenuItem shortcut="⌘S" disabled={props.saving} onSelect={() => select(props.onSave)}>{props.saving ? 'Saving project…' : 'Save Studio project'}</MenuItem>
        <Separator />
        <p className="px-2.5 py-1 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Export as</p>
        <MenuItem disabled={props.exporting} onSelect={() => select(() => props.onExport('png'))}>PNG image</MenuItem>
        <MenuItem disabled={props.exporting} onSelect={() => select(() => props.onExport('jpeg'))}>JPEG image</MenuItem>
        <MenuItem disabled={props.exporting} onSelect={() => select(() => props.onExport('webp'))}>WebP image</MenuItem>
      </>, 'w-60')}

      {menu('edit', 'Edit', <>
        <MenuItem shortcut="⌘Z" disabled={!props.canUndo} onSelect={() => select(props.onUndo)}>Undo</MenuItem>
        <MenuItem shortcut="⇧⌘Z" disabled={!props.canRedo} onSelect={() => select(props.onRedo)}>Redo</MenuItem>
      </>)}

      {menu('image', 'Image', <>
        <MenuItem onSelect={() => select(() => props.onRotateCanvas('cw'))}>Rotate canvas 90° clockwise</MenuItem>
        <MenuItem onSelect={() => select(() => props.onRotateCanvas('ccw'))}>Rotate canvas 90° counter-clockwise</MenuItem>
        <Separator />
        <MenuItem onSelect={() => select(() => props.onFlipCanvas('x'))}>Flip canvas horizontal</MenuItem>
        <MenuItem onSelect={() => select(() => props.onFlipCanvas('y'))}>Flip canvas vertical</MenuItem>
      </>, 'w-64')}

      {menu('layer', 'Layer', <>
        <MenuItem shortcut="⇧⌘N" onSelect={() => select(props.onNewLayer)}>New layer</MenuItem>
        <MenuItem onSelect={() => select(props.onNewGroup)}>New group</MenuItem>
        <Separator />
        <MenuItem shortcut="⌘J" disabled={!props.hasLayerSelection} onSelect={() => select(props.onDuplicateLayer)}>Duplicate layer or group</MenuItem>
        <MenuItem disabled={!props.canRasterize} onSelect={() => select(props.onRasterizeLayer)}>Rasterize layer</MenuItem>
        <Separator />
        <MenuItem shortcut="⌫" disabled={!props.hasLayerSelection} onSelect={() => select(props.onDeleteLayer)}>Delete layer or group</MenuItem>
      </>, 'w-60')}

      {menu('select', 'Select', <>
        <MenuItem shortcut="⌘A" onSelect={() => select(props.onSelectAll)}>All</MenuItem>
        <MenuItem shortcut="⌘D" disabled={!props.hasPixelSelection} onSelect={() => select(props.onDeselect)}>Deselect</MenuItem>
        <MenuItem shortcut="⇧⌘I" onSelect={() => select(props.onInvertSelection)}>Inverse</MenuItem>
        <Separator />
        <MenuItem disabled={!props.hasPixelSelection} onSelect={() => select(props.onFeatherSelection)}>Feather 4 px</MenuItem>
        <MenuItem disabled={!props.hasPixelSelection} onSelect={() => select(props.onExpandSelection)}>Expand 4 px</MenuItem>
        <MenuItem disabled={!props.hasPixelSelection} onSelect={() => select(props.onContractSelection)}>Contract 4 px</MenuItem>
      </>)}

      {menu('filter', 'Filter', <>
        <MenuItem disabled={!props.hasFilterTarget} onSelect={() => select(() => props.onFilter('blur'))}>Gaussian blur</MenuItem>
        <MenuItem disabled={!props.hasFilterTarget} onSelect={() => select(() => props.onFilter('sharpen'))}>Sharpen</MenuItem>
        <Separator />
        <MenuItem disabled={!props.hasFilterTarget} onSelect={() => select(() => props.onFilter('grayscale'))}>Grayscale</MenuItem>
        <MenuItem disabled={!props.hasFilterTarget} onSelect={() => select(() => props.onFilter('sepia'))}>Sepia</MenuItem>
        <MenuItem disabled={!props.hasFilterTarget} onSelect={() => select(() => props.onFilter('invert'))}>Invert</MenuItem>
        <Separator />
        <MenuItem disabled={!props.hasFilterTarget} onSelect={() => select(() => props.onFilter('reset'))}>Reset layer filters</MenuItem>
      </>)}

      {menu('view', 'View', <>
        <MenuItem shortcut="⌘+" onSelect={() => select(() => props.onZoom('in'))}>Zoom in</MenuItem>
        <MenuItem shortcut="⌘−" onSelect={() => select(() => props.onZoom('out'))}>Zoom out</MenuItem>
        <MenuItem shortcut="⌘0" onSelect={() => select(() => props.onZoom('actual'))}>100%</MenuItem>
      </>, 'w-48')}
    </div>
  )
}
