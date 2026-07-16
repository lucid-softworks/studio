import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { WorkspacePreset } from '../editor/panel-layout'
import { commandForEvent, shortcutLabel, type ShortcutMap } from '../editor/shortcuts'
import type { PluginExporterHook, PluginFilterHook } from '../editor/plugins'

type ExportFormat = 'png' | 'jpeg' | 'webp' | 'svg' | 'psd' | 'psb' | 'tiff' | 'pdf' | 'gif' | 'apng' | 'avif'
type MenuName = 'file' | 'edit' | 'image' | 'layer' | 'select' | 'filter' | 'view' | 'help'

type MenuBarProps = {
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  shortcuts: ShortcutMap
  onEditShortcuts: () => void
  onOpenScripts: () => void
  onOpenPlugins: () => void
  onOpenCommands: () => void
  onOpenHelp: () => void
  onExportDiagnostics: () => void
  onToggleTimeline: () => void
  pluginExporters: Array<PluginExporterHook & { pluginId: string }>
  onPluginExport: (hook: PluginExporterHook) => void
  pluginFilters: Array<PluginFilterHook & { pluginId: string }>
  onPluginFilter: (hook: PluginFilterHook) => void
  onAddImage: () => void
  onPlaceLinkedSmartObject: () => void
  onLoadFont: () => void
  onLoadBrush: () => void
  onExport: (format: ExportFormat) => void
  onExportArtboards: () => void
  onOpenExportWorkspace: () => void
  onOpenPrint: () => void
  desktopAvailable: boolean
  onManageScratch: () => void
  onUndo: () => void
  onRedo: () => void
  onTransformAgain: () => void
  onContentAwareFill: () => void
  onRotateCanvas: (direction: 'cw' | 'ccw') => void
  onFlipCanvas: (axis: 'x' | 'y') => void
  onNewLayer: () => void
  onNewGroup: () => void
  onDuplicateLayer: () => void
  onRasterizeLayer: () => void
  onConvertToSmartObject: () => void
  onReplaceSmartObject: () => void
  onRelinkSmartObject: () => void
  onExportSmartObject: () => void
  onClearLayerEffects: () => void
  onDeleteLayer: () => void
  onSelectAll: () => void
  onDeselect: () => void
  onInvertSelection: () => void
  onFeatherSelection: () => void
  onExpandSelection: () => void
  onContractSelection: () => void
  onColorRange: () => void
  onLuminosityRange: (range: 'shadows' | 'midtones' | 'highlights') => void
  onEdgeSelection: () => void
  onGrowSelection: () => void
  onSimilarSelection: () => void
  onSelectAndMask: () => void
  onFilter: (preset: 'blur' | 'sharpen' | 'grayscale' | 'sepia' | 'invert' | 'reset') => void
  onZoom: (command: 'in' | 'out' | 'actual') => void
  onTogglePanel: (panel: 'properties' | 'layers') => void
  onApplyWorkspace: (workspace: WorkspacePreset) => void
  onSaveWorkspace: () => void
  onDeleteWorkspace: (name: string) => void
  workspacePresets: readonly WorkspacePreset[]
  propertiesPanelVisible: boolean
  layersPanelVisible: boolean
  timelineVisible: boolean
  canUndo: boolean
  canRedo: boolean
  canTransformAgain: boolean
  canContentAwareFill: boolean
  hasLayerSelection: boolean
  canRasterize: boolean
  canConvertToSmartObject: boolean
  smartObjectKind?: 'embedded' | 'linked'
  hasLayerEffects: boolean
  hasPixelSelection: boolean
  hasFilterTarget: boolean
  saving: boolean
  exporting: boolean
  hasArtboards: boolean
}

function MenuItem({ commandId, children, shortcut, disabled, checked, onSelect }: { commandId: string; children: ReactNode; shortcut?: string; disabled?: boolean; checked?: boolean; onSelect: () => void }) {
  return (
    <button type="button" role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'} data-command-id={commandId} aria-checked={checked} disabled={disabled} onClick={onSelect} className="flex w-full items-center justify-between gap-8 rounded-md px-2.5 py-1.5 text-left text-[11px] whitespace-nowrap text-zinc-300 outline-none transition hover:bg-violet-400/15 hover:text-white focus-visible:bg-violet-400/15 disabled:pointer-events-none disabled:text-zinc-700">
      <span className="flex items-center gap-2"><span aria-hidden="true" className="w-2 text-[9px] text-violet-300">{checked ? '✓' : ''}</span>{children}</span>{shortcut && <span className="font-mono text-[9px] text-zinc-600">{shortcut}</span>}
    </button>
  )
}

function SavedWorkspaceItem({ name, onSelect, onDelete }: { name: string; onSelect: () => void; onDelete: () => void }) {
  return (
    <div role="none" className="group flex items-center rounded-md hover:bg-violet-400/15">
      <button type="button" role="menuitem" onClick={onSelect} className="min-w-0 flex-1 truncate px-2.5 py-1.5 text-left text-[11px] text-zinc-300 outline-none focus-visible:text-white">{name}</button>
      <button type="button" aria-label={`Delete workspace ${name}`} title="Delete saved workspace" onClick={onDelete} className="mr-1 flex size-5 items-center justify-center rounded text-zinc-700 opacity-0 transition hover:bg-red-400/10 hover:text-red-300 group-hover:opacity-100 focus-visible:opacity-100">×</button>
    </div>
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
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      const command = commandForEvent(event, props.shortcuts)
      if (command === 'file.new') props.onNew()
      else if (command === 'file.open') props.onOpen()
      else if (command === 'file.save') props.onSave()
      else if (command === 'edit.undo' && props.canUndo) props.onUndo()
      else if (command === 'edit.redo' && props.canRedo) props.onRedo()
      else if (command === 'edit.transform-again' && props.canTransformAgain) props.onTransformAgain()
      else if (command === 'layer.new') props.onNewLayer()
      else if (command === 'layer.duplicate' && props.hasLayerSelection) props.onDuplicateLayer()
      else if (command === 'view.actual') props.onZoom('actual')
      else if (command === 'view.zoom-in') props.onZoom('in')
      else if (command === 'view.zoom-out') props.onZoom('out')
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
        <MenuItem commandId="file.new" shortcut={shortcutLabel(props.shortcuts['file.new'])} onSelect={() => select(props.onNew)}>New document</MenuItem>
        <MenuItem commandId="file.open" shortcut={shortcutLabel(props.shortcuts['file.open'])} onSelect={() => select(props.onOpen)}>Open…</MenuItem>
        <Separator />
        <MenuItem commandId="file.place-image" onSelect={() => select(props.onAddImage)}>Place image as layer…</MenuItem>
        <MenuItem commandId="file.place-linked" onSelect={() => select(props.onPlaceLinkedSmartObject)}>Place linked smart object…</MenuItem>
        <MenuItem commandId="file.load-font" onSelect={() => select(props.onLoadFont)}>Load font…</MenuItem>
        <MenuItem commandId="file.load-brush" onSelect={() => select(props.onLoadBrush)}>Load brush tip…</MenuItem>
        <MenuItem commandId="file.plugins" onSelect={() => select(props.onOpenPlugins)}>Manage plugins…</MenuItem>
        {props.desktopAvailable && <MenuItem commandId="file.desktop-scratch" onSelect={() => select(props.onManageScratch)}>Desktop scratch storage…</MenuItem>}
        <Separator />
        <MenuItem commandId="file.save-project" shortcut={shortcutLabel(props.shortcuts['file.save'])} disabled={props.saving} onSelect={() => select(props.onSave)}>{props.saving ? 'Saving project…' : 'Save Studio project'}</MenuItem>
        <Separator />
        <MenuItem commandId="file.export-assets" disabled={props.exporting} onSelect={() => select(props.onOpenExportWorkspace)}>Export assets…</MenuItem>
        <MenuItem commandId="file.print" disabled={props.exporting} onSelect={() => select(props.onOpenPrint)}>Print and PDF…</MenuItem>
        <p className="px-2.5 py-1 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Export as</p>
        <MenuItem commandId="file.export.png" disabled={props.exporting} onSelect={() => select(() => props.onExport('png'))}>PNG image</MenuItem>
        <MenuItem commandId="file.export.jpeg" disabled={props.exporting} onSelect={() => select(() => props.onExport('jpeg'))}>JPEG image</MenuItem>
        <MenuItem commandId="file.export.webp" disabled={props.exporting} onSelect={() => select(() => props.onExport('webp'))}>WebP image</MenuItem>
        <MenuItem commandId="file.export.svg" disabled={props.exporting} onSelect={() => select(() => props.onExport('svg'))}>Editable SVG</MenuItem>
        <MenuItem commandId="file.export.psd" disabled={props.exporting} onSelect={() => select(() => props.onExport('psd'))}>Layered PSD</MenuItem>
        <MenuItem commandId="file.export.psb" disabled={props.exporting} onSelect={() => select(() => props.onExport('psb'))}>Large document PSB</MenuItem>
        <MenuItem commandId="file.export.tiff" disabled={props.exporting} onSelect={() => select(() => props.onExport('tiff'))}>Layered multipage TIFF</MenuItem>
        <MenuItem commandId="file.export.pdf" disabled={props.exporting} onSelect={() => select(() => props.onExport('pdf'))}>PDF</MenuItem>
        <MenuItem commandId="file.export.avif" disabled={props.exporting} onSelect={() => select(() => props.onExport('avif'))}>AVIF image</MenuItem>
        <MenuItem commandId="file.export.gif" disabled={props.exporting} onSelect={() => select(() => props.onExport('gif'))}>Animated GIF from layers</MenuItem>
        <MenuItem commandId="file.export.apng" disabled={props.exporting} onSelect={() => select(() => props.onExport('apng'))}>Animated PNG from layers</MenuItem>
        {props.pluginExporters.length > 0 && <><Separator /><p className="px-2.5 py-1 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Plugin exporters</p>{props.pluginExporters.map((hook) => <MenuItem commandId={`plugin.export.${hook.pluginId}.${hook.id}`} key={`${hook.pluginId}:${hook.id}`} disabled={props.exporting} onSelect={() => select(() => props.onPluginExport(hook))}>{hook.label}</MenuItem>)}</>}
        <Separator />
        <MenuItem commandId="file.export-artboards" disabled={props.exporting || !props.hasArtboards} onSelect={() => select(props.onExportArtboards)}>Export artboards as PNGs</MenuItem>
      </>, 'w-60')}

      {menu('edit', 'Edit', <>
        <MenuItem commandId="edit.undo" shortcut={shortcutLabel(props.shortcuts['edit.undo'])} disabled={!props.canUndo} onSelect={() => select(props.onUndo)}>Undo</MenuItem>
        <MenuItem commandId="edit.redo" shortcut={shortcutLabel(props.shortcuts['edit.redo'])} disabled={!props.canRedo} onSelect={() => select(props.onRedo)}>Redo</MenuItem>
        <Separator />
        <MenuItem commandId="edit.transform-again" shortcut={shortcutLabel(props.shortcuts['edit.transform-again'])} disabled={!props.canTransformAgain} onSelect={() => select(props.onTransformAgain)}>Transform Again</MenuItem>
        <Separator />
        <MenuItem commandId="edit.content-aware-fill" disabled={!props.canContentAwareFill} onSelect={() => select(props.onContentAwareFill)}>Content-Aware Fill…</MenuItem>
        <Separator />
        <MenuItem commandId="edit.shortcuts" onSelect={() => select(props.onEditShortcuts)}>Keyboard Shortcuts…</MenuItem>
        <MenuItem commandId="edit.scripts" onSelect={() => select(props.onOpenScripts)}>Local Scripts…</MenuItem>
      </>)}

      {menu('image', 'Image', <>
        <MenuItem commandId="image.rotate-cw" onSelect={() => select(() => props.onRotateCanvas('cw'))}>Rotate canvas 90° clockwise</MenuItem>
        <MenuItem commandId="image.rotate-ccw" onSelect={() => select(() => props.onRotateCanvas('ccw'))}>Rotate canvas 90° counter-clockwise</MenuItem>
        <Separator />
        <MenuItem commandId="image.flip-x" onSelect={() => select(() => props.onFlipCanvas('x'))}>Flip canvas horizontal</MenuItem>
        <MenuItem commandId="image.flip-y" onSelect={() => select(() => props.onFlipCanvas('y'))}>Flip canvas vertical</MenuItem>
      </>, 'w-64')}

      {menu('layer', 'Layer', <>
        <MenuItem commandId="layer.new" shortcut={shortcutLabel(props.shortcuts['layer.new'])} onSelect={() => select(props.onNewLayer)}>New layer</MenuItem>
        <MenuItem commandId="layer.new-group" onSelect={() => select(props.onNewGroup)}>New group</MenuItem>
        <Separator />
        <MenuItem commandId="layer.duplicate" shortcut={shortcutLabel(props.shortcuts['layer.duplicate'])} disabled={!props.hasLayerSelection} onSelect={() => select(props.onDuplicateLayer)}>Duplicate layer or group</MenuItem>
        <MenuItem commandId="layer.rasterize" disabled={!props.canRasterize} onSelect={() => select(props.onRasterizeLayer)}>Rasterize layer</MenuItem>
        <MenuItem commandId="layer.smart-object.convert" disabled={!props.canConvertToSmartObject} onSelect={() => select(props.onConvertToSmartObject)}>Convert to smart object</MenuItem>
        <MenuItem commandId="layer.smart-object.replace" disabled={props.smartObjectKind !== 'embedded'} onSelect={() => select(props.onReplaceSmartObject)}>Replace smart-object contents…</MenuItem>
        <MenuItem commandId="layer.smart-object.relink" disabled={props.smartObjectKind !== 'linked'} onSelect={() => select(props.onRelinkSmartObject)}>Relink smart object…</MenuItem>
        <MenuItem commandId="layer.smart-object.export" disabled={!props.smartObjectKind} onSelect={() => select(props.onExportSmartObject)}>Export smart-object contents…</MenuItem>
        <MenuItem commandId="layer.effects.clear" disabled={!props.hasLayerEffects} onSelect={() => select(props.onClearLayerEffects)}>Clear layer effects</MenuItem>
        <Separator />
        <MenuItem commandId="layer.delete" shortcut="⌫" disabled={!props.hasLayerSelection} onSelect={() => select(props.onDeleteLayer)}>Delete layer or group</MenuItem>
      </>, 'w-60')}

      {menu('select', 'Select', <>
        <MenuItem commandId="select.all" shortcut="⌘A" onSelect={() => select(props.onSelectAll)}>All</MenuItem>
        <MenuItem commandId="select.deselect" shortcut="⌘D" disabled={!props.hasPixelSelection} onSelect={() => select(props.onDeselect)}>Deselect</MenuItem>
        <MenuItem commandId="select.inverse" shortcut="⇧⌘I" onSelect={() => select(props.onInvertSelection)}>Inverse</MenuItem>
        <Separator />
        <MenuItem commandId="select.feather" disabled={!props.hasPixelSelection} onSelect={() => select(props.onFeatherSelection)}>Feather 4 px</MenuItem>
        <MenuItem commandId="select.expand" disabled={!props.hasPixelSelection} onSelect={() => select(props.onExpandSelection)}>Expand 4 px</MenuItem>
        <MenuItem commandId="select.contract" disabled={!props.hasPixelSelection} onSelect={() => select(props.onContractSelection)}>Contract 4 px</MenuItem>
        <Separator />
        <MenuItem commandId="select.color-range" onSelect={() => select(props.onColorRange)}>Color range from foreground</MenuItem>
        <MenuItem commandId="select.luminosity.shadows" onSelect={() => select(() => props.onLuminosityRange('shadows'))}>Luminosity range: Shadows</MenuItem>
        <MenuItem commandId="select.luminosity.midtones" onSelect={() => select(() => props.onLuminosityRange('midtones'))}>Luminosity range: Midtones</MenuItem>
        <MenuItem commandId="select.luminosity.highlights" onSelect={() => select(() => props.onLuminosityRange('highlights'))}>Luminosity range: Highlights</MenuItem>
        <MenuItem commandId="select.subject-edges" onSelect={() => select(props.onEdgeSelection)}>Find subject edges</MenuItem>
        <MenuItem commandId="select.grow" disabled={!props.hasPixelSelection} onSelect={() => select(props.onGrowSelection)}>Grow</MenuItem>
        <MenuItem commandId="select.similar" disabled={!props.hasPixelSelection} onSelect={() => select(props.onSimilarSelection)}>Similar</MenuItem>
        <Separator />
        <MenuItem commandId="select.mask-workspace" disabled={!props.hasPixelSelection} onSelect={() => select(props.onSelectAndMask)}>Select and Mask…</MenuItem>
      </>)}

      {menu('filter', 'Filter', <>
        <MenuItem commandId="filter.gaussian-blur" disabled={!props.hasFilterTarget} onSelect={() => select(() => props.onFilter('blur'))}>Gaussian blur</MenuItem>
        <MenuItem commandId="filter.sharpen" disabled={!props.hasFilterTarget} onSelect={() => select(() => props.onFilter('sharpen'))}>Sharpen</MenuItem>
        <Separator />
        <MenuItem commandId="filter.grayscale" disabled={!props.hasFilterTarget} onSelect={() => select(() => props.onFilter('grayscale'))}>Grayscale</MenuItem>
        <MenuItem commandId="filter.sepia" disabled={!props.hasFilterTarget} onSelect={() => select(() => props.onFilter('sepia'))}>Sepia</MenuItem>
        <MenuItem commandId="filter.invert" disabled={!props.hasFilterTarget} onSelect={() => select(() => props.onFilter('invert'))}>Invert</MenuItem>
        <Separator />
        <MenuItem commandId="filter.reset" disabled={!props.hasFilterTarget} onSelect={() => select(() => props.onFilter('reset'))}>Reset layer filters</MenuItem>
        {props.pluginFilters.length > 0 && <><Separator /><p className="px-2.5 py-1 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Plugin filters</p>{props.pluginFilters.map((hook) => <MenuItem commandId={`plugin.filter.${hook.pluginId}.${hook.id}`} key={`${hook.pluginId}:${hook.id}`} disabled={!props.hasFilterTarget} onSelect={() => select(() => props.onPluginFilter(hook))}>{hook.label}</MenuItem>)}</>}
      </>)}

      {menu('view', 'View', <>
        <MenuItem commandId="view.zoom-in" shortcut={shortcutLabel(props.shortcuts['view.zoom-in'])} onSelect={() => select(() => props.onZoom('in'))}>Zoom in</MenuItem>
        <MenuItem commandId="view.zoom-out" shortcut={shortcutLabel(props.shortcuts['view.zoom-out'])} onSelect={() => select(() => props.onZoom('out'))}>Zoom out</MenuItem>
        <MenuItem commandId="view.actual" shortcut={shortcutLabel(props.shortcuts['view.actual'])} onSelect={() => select(() => props.onZoom('actual'))}>100%</MenuItem>
        <Separator />
        <p className="px-2.5 py-1 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Panels</p>
        <MenuItem commandId="view.panel.properties" checked={props.propertiesPanelVisible} onSelect={() => select(() => props.onTogglePanel('properties'))}>Properties</MenuItem>
        <MenuItem commandId="view.panel.layers" checked={props.layersPanelVisible} onSelect={() => select(() => props.onTogglePanel('layers'))}>Layers</MenuItem>
        <MenuItem commandId="view.panel.timeline" checked={props.timelineVisible} onSelect={() => select(props.onToggleTimeline)}>Timeline</MenuItem>
        <Separator />
        <p className="px-2.5 py-1 text-[8px] font-semibold tracking-[0.16em] text-zinc-700 uppercase">Workspace</p>
        {props.workspacePresets.map((workspace) => workspace.builtIn
          ? <MenuItem commandId="view.workspace.apply" key={workspace.name} onSelect={() => select(() => props.onApplyWorkspace(workspace))}>{workspace.name}</MenuItem>
          : <SavedWorkspaceItem key={workspace.name} name={workspace.name} onSelect={() => select(() => props.onApplyWorkspace(workspace))} onDelete={() => select(() => props.onDeleteWorkspace(workspace.name))} />)}
        <Separator />
        <MenuItem commandId="view.workspace.save" onSelect={() => select(props.onSaveWorkspace)}>Save current workspace…</MenuItem>
      </>, 'w-60')}

      {menu('help', 'Help', <>
        <MenuItem commandId="help.commands" shortcut="⌘K" onSelect={() => select(props.onOpenCommands)}>Search commands…</MenuItem>
        <MenuItem commandId="help.context" shortcut="F1" onSelect={() => select(props.onOpenHelp)}>Contextual help…</MenuItem>
        <Separator />
        <MenuItem commandId="help.diagnostics" onSelect={() => select(props.onExportDiagnostics)}>Export diagnostics…</MenuItem>
        <p className="px-2.5 py-1.5 text-[8px] leading-relaxed text-zinc-700">Diagnostics exclude document content, names, paths, and local resource data.</p>
      </>, 'w-60')}
    </div>
  )
}
