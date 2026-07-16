import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent, type RefObject } from 'react'
import { hasEnabledLayerEffects } from '../editor/effects'
import type { GradientPreset } from '../editor/gradients'
import type { PatternPreset } from '../editor/patterns'
import type { BrushPreset, CustomFontResource } from '../editor/resources'
import type { CustomShapePreset } from '../editor/shape-library'
import { clampFloatingPanelPosition, type FloatingPanelPosition, type UtilityPanelId } from '../editor/panel-layout'
import type { AssetMap } from '../editor/runtime-assets'
import type { ComponentChannel, SelectionMode, SelectionState } from '../editor/selection'
import { getDescendantLayers, getStackChildren, groupIsLocked, layerIsLocked } from '../editor/stack'
import type { DocumentChannel, DocumentHistoryCommand, DocumentPath, EditorDispatch, EditorDocument, EditorLayer, LayerGroup, PatternSettings } from '../editor/types'
import { CircleIcon, EyeIcon, ImageIcon, LockIcon, RectangleIcon, TextIcon, TrashIcon } from './Icons'
import { CollapsedPanelRail, PanelCollapseButton } from './PanelCollapseControls'
import { PanelResizeHandle } from './PanelResizeHandle'
import { ChannelsPanel, GradientsPanel, HistogramPanel, HistoryPanel, InfoPanel, LibrariesPanel, NavigatorPanel, PathsPanel, PatternsPanel, SwatchesPanel, type AlphaChannelTransform } from './UtilityPanels'

type LayersPanelProps = {
  document: EditorDocument
  dispatch: EditorDispatch
  onAddLayer: () => void
  onAddAdjustment: () => void
  onAddGroup: () => void
  editingMaskLayerId: string | null
  onAddMask: (layerId: string) => void
  onEditMask: (layerId: string) => void
  onRemoveMask: (layerId: string) => void
  dockSide: 'left' | 'right'
  onSwapPanels: () => void
  width: number
  onWidthChange: (width: number) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  activePanel: UtilityPanelId
  onActivePanelChange: (panel: UtilityPanelId) => void
  assets: AssetMap
  canvasRef: RefObject<HTMLCanvasElement | null>
  selection: SelectionState | null
  onLoadComponentChannel: (channel: ComponentChannel, mode: SelectionMode) => void
  onSaveAlphaChannel: (name: string) => void
  onLoadAlphaChannel: (channel: DocumentChannel, mode: SelectionMode) => void
  onDuplicateAlphaChannel: (channel: DocumentChannel) => void
  onDeleteAlphaChannel: (channel: DocumentChannel) => void
  onTransformAlphaChannel: (channel: DocumentChannel, operation: AlphaChannelTransform) => void
  onFillPath: (path: DocumentPath) => void
  onStrokePath: (path: DocumentPath) => void
  customShapes: CustomShapePreset[]
  onSaveCustomShape: (path: DocumentPath) => void
  onApplyCustomShape: (shape: CustomShapePreset) => void
  onRemoveCustomShape: (id: string) => void
  onImportCustomShape: () => void
  onExportPath: (path: DocumentPath) => void
  zoom: number
  onZoomChange: (zoom: number) => void
  renderer: 'canvas2d' | 'webgpu'
  historyPast: DocumentHistoryCommand[]
  historyFuture: DocumentHistoryCommand[]
  rasterUndoDepth: number
  onJumpHistory: (index: number) => void
  renderRevision: number
  panelOrder: UtilityPanelId[]
  onPanelOrderChange: (moved: UtilityPanelId, before: UtilityPanelId) => void
  floating: boolean
  floatingPosition: FloatingPanelPosition
  onFloatingPositionChange: (position: FloatingPanelPosition) => void
  onToggleFloating: () => void
  foregroundColor: string
  backgroundColor: string
  customSwatches: string[]
  onForegroundColorChange: (color: string) => void
  onBackgroundColorChange: (color: string) => void
  onAddSwatch: (color: string) => void
  onRemoveSwatch: (color: string) => void
  customGradients: GradientPreset[]
  onApplyGradient: (gradient: Pick<GradientPreset, 'start' | 'end'>) => void
  onAddGradient: (name: string, start: string, end: string) => void
  onRemoveGradient: (id: string) => void
  customPatterns: PatternPreset[]
  onApplyPattern: (pattern: PatternSettings) => void
  onAddPattern: (name: string, pattern: PatternSettings) => void
  onRemovePattern: (id: string) => void
  brushes: BrushPreset[]
  brushId: string
  customFonts: CustomFontResource[]
  onBrushChange: (id: string) => void
  onLoadBrush: () => void
  onRemoveBrush: (id: string) => void
  onExportBrush: (brush: BrushPreset) => void
  onLoadFont: () => void
  onRemoveFont: (id: string) => void
}

type DraggedItem = { type: 'layer' | 'group'; id: string }
type DropTarget = { key: string; parentId: string | null; beforeId?: string | null }
const utilityTabs: Array<{ id: UtilityPanelId; label: string; title?: string }> = [{ id: 'layers', label: 'Layers' }, { id: 'channels', label: 'Chan', title: 'Channels' }, { id: 'paths', label: 'Paths' }, { id: 'history', label: 'History' }, { id: 'navigator', label: 'Nav', title: 'Navigator' }, { id: 'histogram', label: 'Hist', title: 'Histogram' }, { id: 'swatches', label: 'Swat', title: 'Swatches' }, { id: 'gradients', label: 'Grad', title: 'Gradients' }, { id: 'patterns', label: 'Patt', title: 'Patterns' }, { id: 'libraries', label: 'Lib', title: 'Libraries' }, { id: 'info', label: 'Info' }]

function FolderIcon({ open = false }: { open?: boolean }) {
  return <svg viewBox="0 0 20 20" aria-hidden="true" className="size-3.5"><path d={open ? 'M2.5 6.5h5l1.5 2h8.5l-1.5 7H4z' : 'M2.5 5h5l1.5 2h7.5v8.5h-14z'} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
}

function LayerTypeIcon({ layer }: { layer: EditorLayer }) {
  if (layer.type === 'image' || layer.type === 'raster') return <ImageIcon className="size-3.5" />
  if (layer.type === 'smart-object') return <span className="relative"><ImageIcon className="size-3.5" /><span className="absolute -right-1 -bottom-1 text-[7px] leading-none">◇</span></span>
  if (layer.type === 'text') return <TextIcon className="size-3.5" />
  if (layer.type === 'adjustment') return <span className="text-xs">◐</span>
  return layer.shape === 'ellipse' ? <CircleIcon className="size-3.5" /> : <RectangleIcon className="size-3.5" />
}

export function LayersPanel({ document, dispatch, onAddLayer, onAddAdjustment, onAddGroup, editingMaskLayerId, onAddMask, onEditMask, onRemoveMask, dockSide, onSwapPanels, width, onWidthChange, collapsed, onToggleCollapsed, activePanel, onActivePanelChange, assets, canvasRef, selection, onLoadComponentChannel, onSaveAlphaChannel, onLoadAlphaChannel, onDuplicateAlphaChannel, onDeleteAlphaChannel, onTransformAlphaChannel, onFillPath, onStrokePath, customShapes, onSaveCustomShape, onApplyCustomShape, onRemoveCustomShape, onImportCustomShape, onExportPath, zoom, onZoomChange, renderer, historyPast, historyFuture, rasterUndoDepth, onJumpHistory, renderRevision, panelOrder, onPanelOrderChange, floating, floatingPosition, onFloatingPositionChange, onToggleFloating, foregroundColor, backgroundColor, customSwatches, onForegroundColorChange, onBackgroundColorChange, onAddSwatch, onRemoveSwatch, customGradients, onApplyGradient, onAddGradient, onRemoveGradient, customPatterns, onApplyPattern, onAddPattern, onRemovePattern, brushes, brushId, customFonts, onBrushChange, onLoadBrush, onRemoveBrush, onExportBrush, onLoadFont, onRemoveFont }: LayersPanelProps) {
  const [dragging, setDragging] = useState<DraggedItem | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const activeTabRef = useRef<HTMLButtonElement>(null)
  const activeLayer = document.layers.find((layer) => layer.id === document.selectedLayerId)
  const activeGroup = document.groups.find((group) => group.id === document.selectedGroupId)
  const toggleVectorMask = (layer: EditorLayer) => {
    if (layer.vectorMask) {
      dispatch({ type: 'update-layer', id: layer.id, patch: { vectorMask: null } })
      return
    }
    const width = canvasRef.current?.width ?? document.canvasSize.width
    const height = canvasRef.current?.height ?? document.canvasSize.height
    const bounds = selection?.bounds ?? { x: 0, y: 0, width, height }
    const left = bounds.x / width
    const top = bounds.y / height
    const right = (bounds.x + bounds.width) / width
    const bottom = (bounds.y + bounds.height) / height
    const knot = (x: number, y: number) => ({ linked: true, in: { x, y }, anchor: { x, y }, out: { x, y } })
    dispatch({ type: 'update-layer', id: layer.id, patch: { vectorMask: { density: 100, feather: 0, linked: true, inverted: false, disabled: false, fillStartsWithAllPixels: false, paths: [{ closed: true, operation: 'combine', fillRule: 'non-zero', knots: [knot(left, top), knot(right, top), knot(right, bottom), knot(left, bottom)] }] } } })
  }
  const visibleFloatingPosition = typeof window === 'undefined' ? floatingPosition : clampFloatingPanelPosition(floatingPosition, width, { width: window.innerWidth, height: window.innerHeight })

  useEffect(() => activeTabRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }), [activePanel])

  const startFloatingDrag = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const handle = event.currentTarget
    const startX = event.clientX
    const startY = event.clientY
    const startPosition = visibleFloatingPosition
    handle.setPointerCapture(event.pointerId)
    const move = (moveEvent: globalThis.PointerEvent) => onFloatingPositionChange(clampFloatingPanelPosition({ x: startPosition.x + moveEvent.clientX - startX, y: startPosition.y + moveEvent.clientY - startY }, width, { width: window.innerWidth, height: window.innerHeight }))
    const finish = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', finish)
      handle.removeEventListener('pointercancel', finish)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', finish)
    handle.addEventListener('pointercancel', finish)
  }

  const startDrag = (event: DragEvent, item: DraggedItem) => {
    event.stopPropagation()
    setDragging(item)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `${item.type}:${item.id}`)
  }

  const drop = (event: DragEvent, parentId: string | null, beforeId?: string | null) => {
    event.preventDefault()
    event.stopPropagation()
    if (dragging) dispatch({ type: 'move-stack-item', itemType: dragging.type, id: dragging.id, parentId, beforeId })
    setDragging(null)
    setDropTarget(null)
  }

  const edgeTarget = (parentId: string | null, targetId: string, above: boolean): DropTarget => {
    const siblings = getStackChildren(document, parentId).filter((item) => item.id !== dragging?.id)
    const index = siblings.findIndex((item) => item.id === targetId)
    return {
      key: `${above ? 'above' : 'below'}:${targetId}`,
      parentId,
      beforeId: above ? siblings[index + 1]?.id ?? null : targetId,
    }
  }

  const dropAtTarget = (event: DragEvent) => {
    if (dropTarget) drop(event, dropTarget.parentId, dropTarget.beforeId)
  }

  const layerRow = (layer: EditorLayer, depth: number) => {
    const selected = document.selectedLayerIds.includes(layer.id) && !document.selectedGroupId
    const active = layer.id === document.selectedLayerId
    const inheritedLock = layerIsLocked(document, layer) && !layer.locked
    return (
      <div
        key={layer.id}
        draggable
        onDragStart={(event) => startDrag(event, { type: 'layer', id: layer.id })}
        onDragEnd={() => { setDragging(null); setDropTarget(null) }}
        onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setDropTarget(edgeTarget(layer.groupId ?? null, layer.id, event.clientY < rect.top + rect.height / 2)) }}
        onDrop={dropAtTarget}
        style={{ marginLeft: depth * 14 }}
        className={`group flex w-[calc(100%-var(--indent,0px))] items-center rounded-lg border p-1 transition ${dropTarget?.key.endsWith(`:${layer.id}`) ? `${dropTarget.key.startsWith('above') ? 'border-t-violet-300' : 'border-b-violet-300'} bg-violet-400/10` : selected ? 'border-violet-400/25 bg-violet-400/10 text-zinc-100' : 'border-transparent text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'}`}
      >
        <button type="button" onClick={(event) => dispatch({ type: 'select-layer', id: layer.id, mode: event.shiftKey || event.metaKey || event.ctrlKey ? 'toggle' : 'replace' }, { record: false })} className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left focus-visible:outline-2 focus-visible:outline-violet-400">
          <span className={`flex size-7 shrink-0 items-center justify-center rounded-md ${active ? 'bg-violet-400/20 text-violet-200 ring-1 ring-violet-300/30' : selected ? 'bg-violet-400/10 text-violet-400' : 'bg-white/[0.04]'}`}><LayerTypeIcon layer={layer} /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{layer.clipToBelow && <span className="mr-1 text-violet-300/60">↳</span>}{layer.name}</span><span className="block text-[9px] tracking-wide text-zinc-700 uppercase">{layer.type}</span></span>
          {hasEnabledLayerEffects(layer.effects) && <span title="Layer effects enabled" className="font-serif text-[10px] italic text-violet-300/70">fx</span>}
          {!layer.visible && <span className="size-1.5 rounded-full bg-zinc-700" />}
        </button>
        <div className={`flex shrink-0 items-center ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
          {layer.maskAssetId && <button type="button" aria-label={editingMaskLayerId === layer.id ? 'Edit layer pixels' : 'Edit layer mask'} onClick={() => onEditMask(layer.id)} className={`flex size-6 items-center justify-center rounded text-[8px] font-bold ${editingMaskLayerId === layer.id ? 'bg-cyan-400/15 text-cyan-200' : 'text-zinc-600 hover:text-zinc-300'}`}>M</button>}
          <button type="button" aria-label={layer.visible ? 'Hide layer' : 'Show layer'} onClick={() => dispatch({ type: 'update-layer', id: layer.id, patch: { visible: !layer.visible } })} className="flex size-6 items-center justify-center rounded text-zinc-600 hover:text-zinc-300"><EyeIcon className="size-3.5" closed={!layer.visible} /></button>
          <button type="button" aria-label={layer.locked ? 'Unlock layer' : inheritedLock ? 'Locked by parent group' : 'Lock layer'} disabled={inheritedLock} onClick={() => dispatch({ type: 'update-layer', id: layer.id, patch: { locked: !layer.locked } })} className="flex size-6 items-center justify-center rounded text-zinc-600 hover:text-zinc-300 disabled:text-amber-700"><LockIcon className="size-3.5" locked={layer.locked || inheritedLock} /></button>
          {active && <><button type="button" aria-label="Move layer up" onClick={() => dispatch({ type: 'move-layer', id: layer.id, direction: 'up' })} className="flex size-5 items-center justify-center rounded text-[10px] text-zinc-600 hover:text-zinc-300">↑</button><button type="button" aria-label="Move layer down" onClick={() => dispatch({ type: 'move-layer', id: layer.id, direction: 'down' })} className="flex size-5 items-center justify-center rounded text-[10px] text-zinc-600 hover:text-zinc-300">↓</button>{layer.groupId && <button type="button" aria-label="Move layer out of group" onClick={() => dispatch({ type: 'move-stack-item', itemType: 'layer', id: layer.id, parentId: document.groups.find((group) => group.id === layer.groupId)?.parentId ?? null })} className="flex size-5 items-center justify-center rounded text-[10px] text-zinc-600 hover:text-zinc-300">←</button>}</>}
        </div>
      </div>
    )
  }

  const groupRow = (group: LayerGroup, depth: number) => {
    const selected = group.id === document.selectedGroupId
    const children = getStackChildren(document, group.id)
    const descendantCount = getDescendantLayers(document, group.id).length
    const inheritedLock = groupIsLocked(document, group) && !group.locked
    return (
      <div key={group.id} style={{ marginLeft: depth * 14 }} className={`rounded-lg border transition ${dropTarget?.key === `inside:${group.id}` ? 'border-cyan-200/60 bg-cyan-300/10' : dropTarget?.key.endsWith(`:${group.id}`) ? `${dropTarget.key.startsWith('above') ? 'border-t-violet-300' : 'border-b-violet-300'} bg-violet-400/5` : selected ? 'border-cyan-300/20 bg-cyan-300/[0.06]' : 'border-white/[0.04] bg-black/10'}`}>
        <div
          className="group flex items-center p-1"
          draggable
          onDragStart={(event) => startDrag(event, { type: 'group', id: group.id })}
          onDragEnd={() => { setDragging(null); setDropTarget(null) }}
          onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); const ratio = (event.clientY - rect.top) / rect.height; setDropTarget(ratio < 0.3 ? edgeTarget(group.parentId ?? null, group.id, true) : ratio > 0.7 ? edgeTarget(group.parentId ?? null, group.id, false) : { key: `inside:${group.id}`, parentId: group.id }) }}
          onDrop={dropAtTarget}
        >
          <button type="button" aria-label={group.collapsed ? 'Expand group' : 'Collapse group'} onClick={() => dispatch({ type: 'update-group', id: group.id, patch: { collapsed: !group.collapsed } }, { record: false })} className="flex size-6 items-center justify-center rounded text-[10px] text-zinc-600 hover:text-zinc-300">{group.collapsed ? '›' : '⌄'}</button>
          <button type="button" onClick={() => dispatch({ type: 'select-group', id: group.id }, { record: false })} className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left focus-visible:outline-2 focus-visible:outline-cyan-300">
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-md ${selected ? 'bg-cyan-300/15 text-cyan-200 ring-1 ring-cyan-200/20' : 'bg-white/[0.04] text-zinc-600'}`}><FolderIcon open={!group.collapsed} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-zinc-300">{group.name}</span><span className="block text-[9px] tracking-wide text-zinc-700 uppercase">{descendantCount} layer{descendantCount === 1 ? '' : 's'} · {children.filter((item) => item.type === 'group').length} folder{children.filter((item) => item.type === 'group').length === 1 ? '' : 's'}</span></span>
          </button>
          <div className={`flex items-center ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
            <button type="button" aria-label={group.visible ? 'Hide group' : 'Show group'} onClick={() => dispatch({ type: 'update-group', id: group.id, patch: { visible: !group.visible } })} className="flex size-6 items-center justify-center rounded text-zinc-600 hover:text-zinc-300"><EyeIcon className="size-3.5" closed={!group.visible} /></button>
            <button type="button" aria-label={group.locked ? 'Unlock group' : inheritedLock ? 'Locked by parent group' : 'Lock group'} disabled={inheritedLock} onClick={() => dispatch({ type: 'update-group', id: group.id, patch: { locked: !group.locked } })} className="flex size-6 items-center justify-center rounded text-zinc-600 hover:text-zinc-300 disabled:text-amber-700"><LockIcon className="size-3.5" locked={group.locked || inheritedLock} /></button>
            {selected && <><button type="button" aria-label="Move group up" onClick={() => dispatch({ type: 'move-group', id: group.id, direction: 'up' })} className="flex size-5 items-center justify-center rounded text-[10px] text-zinc-600 hover:text-zinc-300">↑</button><button type="button" aria-label="Move group down" onClick={() => dispatch({ type: 'move-group', id: group.id, direction: 'down' })} className="flex size-5 items-center justify-center rounded text-[10px] text-zinc-600 hover:text-zinc-300">↓</button>{group.parentId && <button type="button" aria-label="Move group out of parent" onClick={() => dispatch({ type: 'move-stack-item', itemType: 'group', id: group.id, parentId: document.groups.find((candidate) => candidate.id === group.parentId)?.parentId ?? null })} className="flex size-5 items-center justify-center rounded text-[10px] text-zinc-600 hover:text-zinc-300">←</button>}</>}
          </div>
        </div>
        {!group.collapsed && <div className="space-y-1 border-t border-white/[0.04] py-1 pr-1">{[...children].reverse().map((item) => item.type === 'group' ? groupRow(item.group, 0) : layerRow(item.layer, 0))}{children.length === 0 && <p className="px-4 py-3 text-center text-[9px] text-zinc-700">Empty group — drop layers or folders here</p>}</div>}
      </div>
    )
  }

  const rootItems = getStackChildren(document, null)
  const panelCollapsed = collapsed && !floating
  const panelStyle = {
    '--panel-width': `${width}px`,
    ...(floating ? { left: `${visibleFloatingPosition.x}px`, top: `${visibleFloatingPosition.y}px` } : {}),
  } as CSSProperties

  return (
    <aside aria-label="Utility panel stack" style={panelStyle} onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-studio-panel')) event.preventDefault() }} onDrop={(event) => { if (event.dataTransfer.getData('application/x-studio-panel') === 'properties') onSwapPanels() }} className={floating ? 'fixed z-[65] flex h-[min(72vh,680px)] w-[var(--panel-width)] shrink-0 flex-col overflow-hidden rounded-xl border border-white/[0.12] bg-[#111113] shadow-[0_24px_80px_rgba(0,0,0,0.7)]' : `relative order-3 flex w-full shrink-0 flex-col border-t border-white/[0.07] bg-[#111113] lg:h-[calc(100vh-84px)] lg:border-t-0 ${panelCollapsed ? 'lg:w-10' : 'lg:w-[var(--panel-width)]'} ${dockSide === 'left' ? 'lg:order-1 lg:border-r' : 'lg:order-3 lg:border-l'}`}>
      {panelCollapsed ? <CollapsedPanelRail dockSide={dockSide} label={utilityTabs.find((tab) => tab.id === activePanel)?.label ?? 'Panels'} onClick={onToggleCollapsed} /> : <>
      <PanelResizeHandle dockSide={floating ? 'left' : dockSide} width={width} onChange={onWidthChange} label="Utility panel stack" />
      <div draggable={!floating} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-studio-panel', 'layers') }} className="flex h-10 shrink-0 cursor-grab items-center border-b border-white/[0.07] px-1.5 active:cursor-grabbing">
        {floating && <button type="button" aria-label="Move floating panels" title="Drag floating panels" onPointerDown={startFloatingDrag} className="mr-1 flex size-7 shrink-0 touch-none items-center justify-center rounded text-[10px] tracking-[-2px] text-zinc-700 hover:bg-white/[0.05] hover:text-zinc-300">⠿</button>}
        <div role="tablist" aria-label="Utility panels" className="flex min-w-0 flex-1 items-center overflow-x-auto">
          {panelOrder.map((panelId) => utilityTabs.find((tab) => tab.id === panelId)).filter((tab) => tab !== undefined).map((tab) => <button ref={activePanel === tab.id ? activeTabRef : undefined} key={tab.id} type="button" role="tab" title={tab.title} draggable aria-selected={activePanel === tab.id} onClick={() => onActivePanelChange(tab.id)} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-studio-utility-tab', tab.id) }} onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-studio-utility-tab')) { event.preventDefault(); event.stopPropagation() } }} onDrop={(event) => { const moved = event.dataTransfer.getData('application/x-studio-utility-tab') as UtilityPanelId; if (moved) onPanelOrderChange(moved, tab.id); event.preventDefault(); event.stopPropagation() }} className={`min-w-10 flex-1 cursor-grab rounded-md px-1 py-2 text-[9px] font-semibold transition focus-visible:outline-2 focus-visible:outline-violet-400 active:cursor-grabbing ${activePanel === tab.id ? 'bg-white/[0.07] text-zinc-100' : 'text-zinc-700 hover:text-zinc-400'}`}>{tab.label}</button>)}
        </div>
        <button type="button" aria-label={floating ? 'Dock utility panels' : 'Float utility panels'} title={floating ? 'Dock panels' : 'Float panels'} onClick={onToggleFloating} className="flex size-7 shrink-0 items-center justify-center rounded-md text-[11px] text-zinc-600 transition hover:bg-white/[0.06] hover:text-zinc-200">{floating ? '⊣' : '↗'}</button>
        {!floating && <PanelCollapseButton dockSide={dockSide} label="Panels" onClick={onToggleCollapsed} />}
      </div>

      {activePanel === 'layers' && <>
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.05] px-3">
        <p className="text-[9px] text-zinc-700">{document.layers.length} object{document.layers.length === 1 ? '' : 's'} · {document.groups.length} folder{document.groups.length === 1 ? '' : 's'}</p>
        <div className="flex items-center gap-0.5"><button type="button" title="Group selected layers or nest a folder" aria-label="New layer group" onClick={onAddGroup} className="flex size-7 items-center justify-center rounded-md text-zinc-600 transition hover:bg-white/[0.06] hover:text-zinc-200"><FolderIcon /></button><button type="button" title="New adjustment layer" aria-label="New adjustment layer" onClick={onAddAdjustment} className="flex size-7 items-center justify-center rounded-md text-sm text-zinc-600 transition hover:bg-white/[0.06] hover:text-zinc-200">◐</button><button type="button" title="New empty raster layer" aria-label="New layer" onClick={onAddLayer} className="flex size-7 items-center justify-center rounded-md text-lg font-light text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200">+</button></div>
      </div>
      <div className={`min-h-0 flex-1 space-y-1 overflow-y-auto p-2 ${dragging ? 'ring-1 ring-inset ring-violet-400/20' : ''}`} onDragOver={(event) => { event.preventDefault(); setDropTarget({ key: 'root', parentId: null }) }} onDrop={dropAtTarget}>
        {dragging && <div className={`rounded-md border border-dashed px-2 py-1.5 text-center text-[9px] ${dropTarget?.key === 'root' ? 'border-violet-300/60 text-violet-200' : 'border-white/[0.08] text-zinc-700'}`}>Drop here to move to the document root</div>}
        {[...rootItems].reverse().map((item) => item.type === 'group' ? groupRow(item.group, 0) : layerRow(item.layer, 0))}
        {rootItems.length === 0 && <div className="flex min-h-40 flex-col items-center justify-center px-6 text-center"><span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-white/[0.04] text-zinc-700"><ImageIcon /></span><p className="text-xs font-medium text-zinc-500">Blank document</p><p className="mt-1 text-[10px] leading-relaxed text-zinc-700">Press + to create an empty raster layer.</p></div>}
      </div>

      {activeGroup && <div className="flex items-center justify-between border-t border-white/[0.07] p-3"><button type="button" onClick={() => dispatch({ type: 'remove-group', id: activeGroup.id })} className="rounded-md border border-white/[0.07] px-2 py-1 text-[9px] text-zinc-600 hover:text-zinc-200">Ungroup</button><button type="button" aria-label="Delete group and layers" onClick={() => dispatch({ type: 'remove-group', id: activeGroup.id, deleteLayers: true })} className="flex size-7 items-center justify-center rounded-md text-zinc-600 hover:bg-red-400/10 hover:text-red-300"><TrashIcon className="size-3.5" /></button></div>}
      {!activeGroup && document.selectedLayerIds.length === 1 && activeLayer && activeLayer.type !== 'adjustment' && <div className="flex items-center border-t border-white/[0.05] px-3 pt-2"><button type="button" onClick={() => toggleVectorMask(activeLayer)} className={`rounded-md border px-2 py-1 text-[9px] ${activeLayer.vectorMask ? 'border-violet-300/20 bg-violet-300/10 text-violet-100' : 'border-white/[0.07] text-zinc-600'}`}>{activeLayer.vectorMask ? 'Remove vector mask' : selection?.bounds ? '+ Vector from selection' : '+ Vector mask'}</button></div>}
      {!activeGroup && document.selectedLayerIds.length > 0 && <div className="flex items-center justify-between border-t border-white/[0.07] p-3"><div className="flex items-center gap-1">{document.selectedLayerIds.length === 1 && activeLayer && activeLayer.type !== 'adjustment' && <><button type="button" onClick={() => activeLayer.maskAssetId ? onEditMask(activeLayer.id) : onAddMask(activeLayer.id)} className={`rounded-md border px-2 py-1 text-[9px] ${editingMaskLayerId === activeLayer.id ? 'border-cyan-300/20 bg-cyan-400/10 text-cyan-200' : 'border-white/[0.07] text-zinc-600'}`}>{activeLayer.maskAssetId ? editingMaskLayerId === activeLayer.id ? 'Pixels' : 'Mask' : '+ Mask'}</button>{activeLayer.maskAssetId && <button type="button" aria-label="Remove layer mask" onClick={() => onRemoveMask(activeLayer.id)} className="flex size-6 items-center justify-center rounded text-zinc-700 hover:text-red-300">×</button>}</>}{document.selectedLayerIds.length > 1 && <p className="text-[10px] text-zinc-700">{document.selectedLayerIds.length} selected</p>}</div><button type="button" aria-label="Delete selected layer" onClick={() => dispatch({ type: 'remove-layers', ids: document.selectedLayerIds })} className="flex size-7 items-center justify-center rounded-md text-zinc-600 hover:bg-red-400/10 hover:text-red-300"><TrashIcon className="size-3.5" /></button></div>}
      </>}
      {activePanel === 'channels' && <ChannelsPanel channels={document.channels ?? []} hasSelection={Boolean(selection?.bounds)} onLoadComponent={onLoadComponentChannel} onSaveSelection={onSaveAlphaChannel} onLoadAlpha={onLoadAlphaChannel} onDuplicateAlpha={onDuplicateAlphaChannel} onDeleteAlpha={onDeleteAlphaChannel} onTransformAlpha={onTransformAlphaChannel} />}
      {activePanel === 'paths' && <PathsPanel paths={document.paths ?? []} selectedPathId={document.selectedPathId ?? null} customShapes={customShapes} onChange={(paths, selectedPathId) => dispatch({ type: 'set-paths', paths, selectedPathId })} onFill={onFillPath} onStroke={onStrokePath} onSaveCustomShape={onSaveCustomShape} onApplyCustomShape={onApplyCustomShape} onRemoveCustomShape={onRemoveCustomShape} onImportCustomShape={onImportCustomShape} onExportPath={onExportPath} />}
      {activePanel === 'history' && <HistoryPanel past={historyPast} future={historyFuture} rasterUndoDepth={rasterUndoDepth} onJump={onJumpHistory} />}
      {activePanel === 'navigator' && <NavigatorPanel sourceCanvasRef={canvasRef} document={document} zoom={zoom} onZoomChange={onZoomChange} renderRevision={renderRevision} />}
      {activePanel === 'histogram' && <HistogramPanel sourceCanvasRef={canvasRef} document={document} assets={assets} renderRevision={renderRevision} />}
      {activePanel === 'swatches' && <SwatchesPanel foregroundColor={foregroundColor} backgroundColor={backgroundColor} customSwatches={customSwatches} onForegroundColorChange={onForegroundColorChange} onBackgroundColorChange={onBackgroundColorChange} onAddSwatch={onAddSwatch} onRemoveSwatch={onRemoveSwatch} />}
      {activePanel === 'gradients' && <GradientsPanel foregroundColor={foregroundColor} backgroundColor={backgroundColor} customGradients={customGradients} onApplyGradient={onApplyGradient} onAddGradient={onAddGradient} onRemoveGradient={onRemoveGradient} />}
      {activePanel === 'patterns' && <PatternsPanel pattern={document.pattern} customPatterns={customPatterns} onApplyPattern={onApplyPattern} onAddPattern={onAddPattern} onRemovePattern={onRemovePattern} />}
      {activePanel === 'libraries' && <LibrariesPanel brushes={brushes} activeBrushId={brushId} fonts={customFonts} activeFontFamily={activeLayer?.type === 'text' ? activeLayer.fontFamily : undefined} canApplyFont={activeLayer?.type === 'text'} onBrushChange={onBrushChange} onLoadBrush={onLoadBrush} onRemoveBrush={onRemoveBrush} onExportBrush={onExportBrush} onApplyFont={(fontFamily) => { if (activeLayer?.type === 'text') dispatch({ type: 'update-layer', id: activeLayer.id, patch: { fontFamily, missingFonts: [] } }) }} onLoadFont={onLoadFont} onRemoveFont={onRemoveFont} />}
      {activePanel === 'info' && <InfoPanel sourceCanvasRef={canvasRef} document={document} assets={assets} selection={selection} zoom={zoom} renderer={renderer} renderRevision={renderRevision} />}
      </>}
    </aside>
  )
}
