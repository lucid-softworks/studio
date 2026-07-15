import { useEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction } from 'react'
import { getDocumentSize } from '../editor/presets'
import { getLayerBounds } from '../editor/renderer'
import { layerIsLocked } from '../editor/stack'
import type { AssetMap } from '../editor/runtime-assets'
import type { EditorDispatch, EditorDocument, Position, ShapeKind } from '../editor/types'
import { extractImageData, type RasterEdit, type RasterRegion } from '../editor/raster'
import { applySelectionShape, invertSelection, selectionAlphaAt, type SelectionMode, type SelectionState } from '../editor/selection'
import { RedoIcon, UndoIcon, UploadIcon } from './Icons'
import { CanvasActionOverlay } from './CanvasActionOverlay'
import { CloneStampOverlay } from './CloneStampOverlay'
import { LassoSelectionOverlay } from './LassoSelectionOverlay'
import { MagicWandOverlay } from './MagicWandOverlay'
import { MeasureOverlay, type Measurement } from './MeasureOverlay'
import { RasterFillOverlay } from './RasterFillOverlay'
import { RasterPaintOverlay } from './RasterPaintOverlay'
import { SelectionOverlay } from './SelectionOverlay'
import type { EditorTool } from './ToolRail'
import { TransformOverlay } from './TransformOverlay'
import type { BrushPreset } from '../editor/resources'
import { BrushSettingsPopover } from './BrushSettingsPopover'
import { CanvasRulers } from './CanvasRulers'

type CanvasStageProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  document: EditorDocument
  assets: AssetMap
  dispatch: EditorDispatch
  endHistoryGroup: () => void
  isLoading: boolean
  onFile: (file: File) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onAlign: (alignment: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => void
  onRasterChange: (assetId: string, region?: RasterRegion) => void
  onRasterCommit: (edit: RasterEdit) => void
  editingMaskLayerId: string | null
  selection: SelectionState | null
  onSelectionChange: Dispatch<SetStateAction<SelectionState | null>>
  zoom: number
  onZoomChange: Dispatch<SetStateAction<number>>
  tool: EditorTool
  onToolChange: (tool: EditorTool) => void
  onAddText: (position: Position, color: string) => void
  onAddShape: (shape: ShapeKind, position: Position, fill: string) => void
  onCrop: (bounds: NonNullable<SelectionState['bounds']>) => void
  brushes: BrushPreset[]
  brushId: string
  onBrushChange: (id: string) => void
  onLoadBrush: () => void
  foregroundColor: string
  backgroundColor: string
  onForegroundColorChange: (color: string) => void
  onBackgroundColorChange: (color: string) => void
}

const toolNames: Record<EditorTool, string> = {
  move: 'Move',
  marquee: 'Rectangular Marquee',
  'ellipse-select': 'Elliptical Marquee',
  lasso: 'Lasso',
  'magic-wand': 'Magic Wand',
  'object-select': 'Object Select',
  crop: 'Crop',
  eyedropper: 'Eyedropper',
  measure: 'Measure',
  healing: 'Healing Brush',
  'clone-stamp': 'Clone Stamp',
  brush: 'Brush',
  eraser: 'Eraser',
  fill: 'Paint Bucket',
  gradient: 'Gradient',
  dodge: 'Dodge',
  burn: 'Burn',
  text: 'Type',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  hand: 'Hand',
  zoom: 'Zoom',
}

function toolForShortcut(key: string, shift: boolean): EditorTool | null {
  switch (key) {
    case 'v': return 'move'
    case 'm': return shift ? 'ellipse-select' : 'marquee'
    case 'l': return 'lasso'
    case 'w': return shift ? 'object-select' : 'magic-wand'
    case 'c': return 'crop'
    case 'i': return shift ? 'measure' : 'eyedropper'
    case 'j': return 'healing'
    case 's': return 'clone-stamp'
    case 'b': return 'brush'
    case 'e': return 'eraser'
    case 'g': return shift ? 'gradient' : 'fill'
    case 'o': return shift ? 'burn' : 'dodge'
    case 't': return 'text'
    case 'u': return shift ? 'ellipse' : 'rectangle'
    case 'h': return 'hand'
    case 'z': return 'zoom'
    default: return null
  }
}

function hintForTool(tool: EditorTool, context: { hasCrop: boolean; hasSelection: boolean; editingMaskName?: string; rasterSelected: boolean }) {
  switch (tool) {
    case 'marquee': return 'Drag to make a rectangular selection · Shift constrains · Alt draws from centre'
    case 'ellipse-select': return 'Drag to make an elliptical selection · Shift constrains · Alt draws from centre'
    case 'lasso': return 'Draw a freehand boundary to select an irregular area'
    case 'magic-wand': return 'Click a contiguous colour region to select it'
    case 'object-select': return 'Click visible pixels to select an object · drag to reposition it'
    case 'crop': return context.hasCrop ? 'Adjust the crop region or apply it from the options bar' : 'Drag over the canvas to define a crop region'
    case 'move': return 'Click to select · drag to move · Shift-click for multi-select · drag handles to transform'
    case 'eyedropper': return 'Click the canvas to sample a foreground colour'
    case 'measure': return 'Drag between two points to measure their heading · Shift snaps to 45° · straighten the selected layer from the options bar'
    case 'fill': return 'Click a contiguous area on the selected raster layer to fill it'
    case 'gradient': return 'Drag across the selected raster layer to paint a linear gradient'
    case 'healing':
    case 'clone-stamp': return 'Alt-click to choose a source · drag to paint from it'
    case 'dodge': return 'Drag to lighten pixels on the selected raster layer'
    case 'burn': return 'Drag to darken pixels on the selected raster layer'
    case 'text': return 'Click the canvas to add a text layer'
    case 'rectangle': return 'Click the canvas to add a rectangle layer'
    case 'ellipse': return 'Click the canvas to add an ellipse layer'
    case 'hand': return 'Drag the workspace to pan around the document'
    case 'zoom': return 'Click to zoom in · Alt-click to zoom out'
    case 'brush':
    case 'eraser':
      if (context.editingMaskName) return `${tool === 'brush' ? 'Reveal' : 'Hide'} pixels on ${context.editingMaskName}’s mask${context.hasSelection ? ' inside the current selection' : ''} · undo with ⌘Z`
      if (context.rasterSelected) return `${tool === 'brush' ? 'Paint' : 'Erase'} ${context.hasSelection ? 'inside the current selection' : 'directly on the selected raster layer'} · undo with ⌘Z`
      return 'Select a raster layer to paint'
  }
}

export function CanvasStage({ canvasRef, document, assets, dispatch, endHistoryGroup, isLoading, onFile, canUndo, canRedo, onUndo, onRedo, onAlign, onRasterChange, onRasterCommit, editingMaskLayerId, selection, onSelectionChange: setSelection, zoom, onZoomChange: setZoom, tool, onToolChange, onAddText, onAddShape, onCrop, brushes, brushId, onBrushChange, onLoadBrush, foregroundColor, backgroundColor, onForegroundColorChange, onBackgroundColorChange }: CanvasStageProps) {
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [brushSize, setBrushSize] = useState(48)
  const [brushHardness, setBrushHardness] = useState(80)
  const [brushOpacity, setBrushOpacity] = useState(100)
  const [brushFlow, setBrushFlow] = useState(100)
  const [brushSpacing, setBrushSpacing] = useState(12)
  const [pressureSize, setPressureSize] = useState(true)
  const [pressureOpacity, setPressureOpacity] = useState(false)
  const [toolStrength, setToolStrength] = useState(45)
  const [tolerance, setTolerance] = useState(32)
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('replace')
  const [cropSelection, setCropSelection] = useState<SelectionState | null>(null)
  const [measurement, setMeasurement] = useState<Measurement | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null)
  const preset = getDocumentSize(document)
  const selected = document.layers.find((layer) => layer.id === document.selectedLayerId)
  const selectedGroup = document.groups.find((group) => group.id === document.selectedGroupId)
  const selectedLocked = selected ? layerIsLocked(document, selected) : false
  const editingMaskLayer = document.layers.find((layer) => layer.id === editingMaskLayerId && layer.id === document.selectedLayerId && layer.maskAssetId)
  const selectionTool = tool === 'marquee' || tool === 'ellipse-select' || tool === 'lasso' || tool === 'magic-wand'
  const paintTool = tool === 'brush' || tool === 'eraser' || tool === 'dodge' || tool === 'burn'
  const selectedBrush = brushes.find((candidate) => candidate.id === brushId) ?? brushes[0]
  const brush = { ...selectedBrush, spacing: brushSpacing }
  const retouchTool = tool === 'healing' || tool === 'clone-stamp'
  const measurementAngle = measurement ? Math.atan2(measurement.endY - measurement.startY, measurement.endX - measurement.startX) * 180 / Math.PI : 0
  const measurementLength = measurement ? Math.hypot(measurement.endX - measurement.startX, measurement.endY - measurement.startY) : 0

  useEffect(() => setBrushSpacing(selectedBrush.spacing), [selectedBrush.id, selectedBrush.spacing])
  useEffect(() => setSelection(null), [preset.height, preset.width, setSelection])
  useEffect(() => setCropSelection(null), [preset.height, preset.width])
  useEffect(() => { if (tool !== 'crop') setCropSelection(null) }, [tool])
  useEffect(() => { if (editingMaskLayerId) onToolChange('brush') }, [editingMaskLayerId, onToolChange])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]') || event.metaKey || event.ctrlKey || event.altKey) return
      const next = toolForShortcut(event.key.toLowerCase(), event.shiftKey)
      if (!next) return
      event.preventDefault()
      onToolChange(next)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onToolChange])

  useEffect(() => {
    const clearSelectedPixels = () => {
      if (!selection?.bounds) return false
      if ((editingMaskLayer ?? selected)?.locked || selectedLocked) return false
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return false
      const maskContext = selection.mask.getContext('2d', { willReadFrequently: true })
      if (!maskContext) return false
      const maskData = maskContext.getImageData(0, 0, selection.mask.width, selection.mask.height)
      const targetAssetId = editingMaskLayer?.maskAssetId ?? (selected?.type === 'raster' ? selected.assetId : null)
      const surface = targetAssetId ? assets[targetAssetId]?.surface : null
      if (!targetAssetId || !surface) return false
      const bounds = editingMaskLayer
        ? { x: 0, y: 0, width: canvas.width, height: canvas.height, rotation: 0 }
        : selected ? getLayerBounds(context, canvas, selected, assets) : null
      const surfaceContext = surface.getContext('2d', { willReadFrequently: true })
      if (!bounds || !surfaceContext) return true
      const beforeFull = surfaceContext.getImageData(0, 0, surface.width, surface.height)
      const afterFull = surfaceContext.getImageData(0, 0, surface.width, surface.height)
      const centerX = bounds.x + bounds.width / 2
      const centerY = bounds.y + bounds.height / 2
      const angle = bounds.rotation * Math.PI / 180
      let left = surface.width
      let top = surface.height
      let right = -1
      let bottom = -1
      for (let y = 0; y < surface.height; y += 1) {
        for (let x = 0; x < surface.width; x += 1) {
          const localX = (x / surface.width - 0.5) * bounds.width
          const localY = (y / surface.height - 0.5) * bounds.height
          const documentX = centerX + localX * Math.cos(angle) - localY * Math.sin(angle)
          const documentY = centerY + localX * Math.sin(angle) + localY * Math.cos(angle)
          const coverage = selectionAlphaAt(maskData, documentX, documentY)
          if (coverage === 0) continue
          const alphaOffset = (y * surface.width + x) * 4 + 3
          const nextAlpha = Math.round(afterFull.data[alphaOffset] * (1 - coverage))
          if (nextAlpha === afterFull.data[alphaOffset]) continue
          afterFull.data[alphaOffset] = nextAlpha
          left = Math.min(left, x)
          top = Math.min(top, y)
          right = Math.max(right, x)
          bottom = Math.max(bottom, y)
        }
      }
      if (right >= left) {
        surfaceContext.putImageData(afterFull, 0, 0)
        const width = right - left + 1
        const height = bottom - top + 1
        onRasterChange(targetAssetId, { x: left, y: top, width, height })
        onRasterCommit({ assetId: targetAssetId, x: left, y: top, before: extractImageData(beforeFull, left, top, width, height), after: extractImageData(afterFull, left, top, width, height) })
      }
      return true
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      const command = event.metaKey || event.ctrlKey
      if (command && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        event.stopImmediatePropagation()
        setSelection((current) => applySelectionShape(current, { kind: 'rectangle', x: 0, y: 0, width: preset.width, height: preset.height }, 'replace', preset.width, preset.height))
      } else if (command && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        event.stopImmediatePropagation()
        setSelection(null)
      } else if (command && event.shiftKey && event.key.toLowerCase() === 'i') {
        event.preventDefault()
        event.stopImmediatePropagation()
        setSelection((current) => invertSelection(current, preset.width, preset.height))
      } else if ((event.key === 'Backspace' || event.key === 'Delete') && selection?.bounds && clearSelectedPixels()) {
        event.preventDefault()
        event.stopImmediatePropagation()
      } else if (event.key === 'Escape' && selection?.bounds) {
        event.preventDefault()
        event.stopImmediatePropagation()
        setSelection(null)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [assets, canvasRef, editingMaskLayer, onRasterChange, onRasterCommit, preset.height, preset.width, selected, selectedLocked, selection, setSelection])

  const changeZoom = (direction: 'in' | 'out') => {
    setZoom((value) => Math.max(25, Math.min(400, value + (direction === 'in' ? 25 : -25))))
  }

  const changeBrush = (id: string) => {
    const next = brushes.find((candidate) => candidate.id === id)
    if (!next) return
    setBrushSpacing(next.spacing)
    onBrushChange(id)
  }

  const straightenSelected = () => {
    if (!measurement || !selected || selected.type === 'adjustment' || selectedLocked) return
    dispatch({ type: 'update-layer', id: selected.id, patch: { rotation: selected.rotation - measurementAngle } })
    setMeasurement(null)
  }

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== 'hand' || event.button !== 0) return
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }
    setIsPanning(true)
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Synthetic browser events do not expose capture. */ }
  }

  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    event.currentTarget.scrollLeft = pan.left - (event.clientX - pan.x)
    event.currentTarget.scrollTop = pan.top - (event.clientY - pan.y)
  }

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return
    panRef.current = null
    setIsPanning(false)
  }

  const toolHint = hintForTool(tool, { hasCrop: Boolean(cropSelection?.bounds), hasSelection: Boolean(selection?.bounds), editingMaskName: editingMaskLayer?.name, rasterSelected: selected?.type === 'raster' })

  return (
    <section
      className="order-1 flex min-h-[560px] min-w-0 flex-1 flex-col overflow-hidden bg-[#0b0b0c] lg:order-2 lg:h-[calc(100vh-48px)] lg:min-h-0"
      onDragEnter={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setIsDraggingFile(true) } }}
      onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDraggingFile(false) }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setIsDraggingFile(false)
        const file = event.dataTransfer.files[0]
        if (file) onFile(file)
      }}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5 text-xs text-zinc-400">
          <span className="font-medium text-zinc-200">{toolNames[tool]}</span>
          <span className="hidden h-4 w-px bg-white/[0.07] sm:block" />
          <span className="hidden max-w-36 truncate text-[10px] text-zinc-600 sm:block xl:max-w-56">{selectedGroup?.name ?? (document.selectedLayerIds.length > 1 ? `${document.selectedLayerIds.length} layers selected` : selected?.name ?? 'Canvas')}</span>
          {editingMaskLayer && <span className="rounded bg-cyan-400/10 px-1.5 py-0.5 text-[9px] text-cyan-200/80">Mask</span>}
          {selected?.locked && <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-300/70">Locked</span>}
        </div>
        <div className="flex items-center gap-3">
          {(paintTool || retouchTool) && (
            <div className="hidden items-center gap-2 md:flex">
              {paintTool && <><select aria-label="Brush preset" value={brush.id} onChange={(event) => changeBrush(event.target.value)} className="max-w-28 rounded-md border border-white/[0.08] bg-black/25 px-2 py-1.5 text-[9px] text-zinc-400 outline-none"><option value="round">Round</option>{brushes.filter((preset) => !preset.builtIn).map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select><button type="button" onClick={onLoadBrush} className="rounded-md border border-white/[0.08] px-2 py-1.5 text-[9px] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200">Load…</button><BrushSettingsPopover hardness={brushHardness} opacity={brushOpacity} flow={brushFlow} spacing={brushSpacing} pressureSize={pressureSize} pressureOpacity={pressureOpacity} supportsHardness={!brush.tip} onHardnessChange={setBrushHardness} onOpacityChange={setBrushOpacity} onFlowChange={setBrushFlow} onSpacingChange={setBrushSpacing} onPressureSizeChange={setPressureSize} onPressureOpacityChange={setPressureOpacity} /></>}
              <input aria-label="Brush size" type="range" min="2" max="240" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} className="studio-range w-20" />
              <span className="w-7 font-mono text-[9px] text-zinc-600">{brushSize}</span>
              {tool === 'brush' && <input aria-label="Brush color" type="color" value={foregroundColor} onChange={(event) => onForegroundColorChange(event.target.value)} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />}
              {(retouchTool || tool === 'dodge' || tool === 'burn') && <><span className="text-[9px] text-zinc-600">Strength</span><input aria-label="Tool strength" type="range" min="5" max="100" value={toolStrength} onChange={(event) => setToolStrength(Number(event.target.value))} className="studio-range w-16" /><span className="w-7 font-mono text-[9px] text-zinc-600">{toolStrength}%</span></>}
            </div>
          )}
          {(tool === 'eyedropper' || tool === 'text' || tool === 'rectangle' || tool === 'ellipse' || tool === 'fill' || tool === 'gradient') && (
            <label className="hidden items-center gap-2 text-[9px] text-zinc-600 md:flex">
              <span>{tool === 'text' ? 'Colour' : tool === 'eyedropper' ? 'Sample' : 'Fill'}</span>
              <input aria-label="Foreground color" type="color" value={foregroundColor} onChange={(event) => onForegroundColorChange(event.target.value)} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
              {tool === 'gradient' && <><span>to</span><input aria-label="Background color" type="color" value={backgroundColor} onChange={(event) => onBackgroundColorChange(event.target.value)} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" /></>}
              <span className="hidden font-mono uppercase xl:inline">{foregroundColor}</span>
            </label>
          )}
          {(tool === 'magic-wand' || tool === 'fill') && <label className="hidden items-center gap-2 text-[9px] text-zinc-600 xl:flex"><span>Tolerance</span><input aria-label="Tolerance" type="range" min="0" max="128" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} className="studio-range w-16" /><span className="w-5 font-mono">{tolerance}</span></label>}
          {selectionTool && (
            <div className="hidden items-center rounded-md border border-white/[0.06] bg-black/20 p-0.5 lg:flex">
              {(['replace', 'add', 'subtract', 'intersect'] as SelectionMode[]).map((value) => <button key={value} type="button" aria-label={`${value} selection`} aria-pressed={selectionMode === value} onClick={() => setSelectionMode(value)} className={`rounded px-1.5 py-1 text-[9px] capitalize ${selectionMode === value ? 'bg-violet-400/15 text-violet-200' : 'text-zinc-600 hover:text-zinc-300'}`}>{value}</button>)}
              {selection && <button type="button" aria-label="Clear selection" onClick={() => setSelection(null)} className="rounded px-1.5 py-1 text-[9px] text-zinc-600 hover:text-zinc-200">Clear</button>}
            </div>
          )}
          {tool === 'crop' && <div className="flex items-center gap-1"><button type="button" disabled={!cropSelection?.bounds} onClick={() => { if (cropSelection?.bounds) { onCrop(cropSelection.bounds); setCropSelection(null); onToolChange('move') } }} className="rounded-md bg-violet-500 px-2.5 py-1.5 text-[9px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-30">Apply crop</button><button type="button" onClick={() => { setCropSelection(null); onToolChange('move') }} className="rounded-md px-2 py-1.5 text-[9px] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200">Cancel</button></div>}
          {tool === 'measure' && (
            <div className="flex items-center gap-2">
              <span className="hidden font-mono text-[9px] text-zinc-500 xl:inline">L {measurementLength.toFixed(1)} px</span>
              <span className="font-mono text-[9px] text-zinc-400">A {measurementAngle.toFixed(2)}°</span>
              <button type="button" disabled={!measurement || !selected || selected.type === 'adjustment' || selectedLocked} onClick={straightenSelected} className="rounded-md bg-violet-500 px-2.5 py-1.5 text-[9px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-30">Straighten layer</button>
              {measurement && <button type="button" onClick={() => setMeasurement(null)} className="rounded-md px-2 py-1.5 text-[9px] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200">Clear</button>}
            </div>
          )}
          {document.selectedLayerIds.length > 1 && (
            <div className="hidden items-center rounded-md border border-white/[0.06] bg-black/20 p-0.5 md:flex">
              {[
                ['left', 'L', 'Align left'], ['center-x', 'C', 'Align horizontal centres'], ['right', 'R', 'Align right'],
                ['top', 'T', 'Align top'], ['center-y', 'M', 'Align vertical centres'], ['bottom', 'B', 'Align bottom'],
              ].map(([value, label, title]) => <button key={value} type="button" title={title} aria-label={title} onClick={() => onAlign(value as Parameters<typeof onAlign>[0])} className="flex size-6 items-center justify-center rounded font-mono text-[9px] text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-200">{label}</button>)}
            </div>
          )}
          <div className="flex items-center gap-0.5 sm:hidden">
            <button type="button" disabled={!canUndo} aria-label="Undo" onClick={onUndo} className="flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-white/[0.05] disabled:opacity-20"><UndoIcon className="size-3.5" /></button>
            <button type="button" disabled={!canRedo} aria-label="Redo" onClick={onRedo} className="flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-white/[0.05] disabled:opacity-20"><RedoIcon className="size-3.5" /></button>
          </div>
          <div className="hidden font-mono text-[9px] text-zinc-700 sm:block">{preset.width} × {preset.height}</div>
          <div className="flex items-center rounded-md border border-white/[0.06] bg-black/20 p-0.5">
            <button type="button" aria-label="Zoom out" onClick={() => changeZoom('out')} className="flex size-6 items-center justify-center rounded text-xs text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300">−</button>
            <button type="button" title="Reset zoom" onClick={() => setZoom(100)} className="w-10 text-center font-mono text-[9px] text-zinc-500">{zoom}%</button>
            <button type="button" aria-label="Zoom in" onClick={() => changeZoom('in')} className="flex size-6 items-center justify-center rounded text-xs text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300">+</button>
          </div>
        </div>
      </div>

      <div
        ref={stageRef}
        className={`stage-grid relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-5 sm:p-8 lg:p-10 ${tool === 'hand' ? isPanning ? 'cursor-grabbing' : 'cursor-grab' : ''}`}
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <CanvasRulers stageRef={stageRef} canvasRef={canvasRef} zoom={zoom} guides={document.guides} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(79,70,229,0.08),transparent_42%)]" />
        <div
          className="relative z-10 flex w-full max-w-full shrink-0 items-center justify-center transition-transform duration-150"
          style={{ aspectRatio: `${preset.width} / ${preset.height}`, transform: `scale(${zoom / 100})` }}
        >
          <div className="transparency-grid relative inline-flex max-h-full max-w-full">
            <canvas
              ref={canvasRef}
              width={preset.width}
              height={preset.height}
              aria-label="Composition canvas"
              className={`block h-auto w-auto max-h-[calc(100vh-205px)] max-w-full rounded-sm shadow-[0_28px_80px_rgba(0,0,0,0.5)] transition-opacity ${isLoading ? 'opacity-50' : 'opacity-100'}`}
            />
            <SelectionOverlay canvasRef={canvasRef} enabled={tool === 'marquee' || tool === 'ellipse-select'} kind={tool === 'ellipse-select' ? 'ellipse' : 'rectangle'} mode={selectionMode} selection={selection} onChange={setSelection} />
            <LassoSelectionOverlay canvasRef={canvasRef} enabled={tool === 'lasso'} mode={selectionMode} selection={selection} onChange={setSelection} />
            <MagicWandOverlay canvasRef={canvasRef} enabled={tool === 'magic-wand'} mode={selectionMode} tolerance={tolerance} selection={selection} onChange={setSelection} />
            <MeasureOverlay canvasRef={canvasRef} enabled={tool === 'measure'} value={measurement} onChange={setMeasurement} />
            <SelectionOverlay canvasRef={canvasRef} enabled={tool === 'crop'} kind="rectangle" mode="replace" selection={cropSelection} onChange={setCropSelection} />
            {paintTool && <RasterPaintOverlay canvasRef={canvasRef} document={document} assets={assets} tool={tool} brush={brush} size={brushSize} color={foregroundColor} hardness={brushHardness} opacity={tool === 'dodge' || tool === 'burn' ? toolStrength : brushOpacity} flow={brushFlow} pressureSize={pressureSize} pressureOpacity={pressureOpacity} selection={selection} maskAssetId={editingMaskLayer?.maskAssetId ?? undefined} maskLocked={editingMaskLayer?.locked} locked={selectedLocked} onChange={onRasterChange} onCommit={onRasterCommit} />}
            {(tool === 'fill' || tool === 'gradient') && <RasterFillOverlay canvasRef={canvasRef} document={document} assets={assets} tool={tool} color={foregroundColor} secondaryColor={backgroundColor} tolerance={tolerance} selection={selection} maskAssetId={editingMaskLayer?.maskAssetId ?? undefined} maskLocked={editingMaskLayer?.locked} locked={selectedLocked} onChange={onRasterChange} onCommit={onRasterCommit} />}
            {retouchTool && <CloneStampOverlay canvasRef={canvasRef} document={document} assets={assets} tool={tool} size={brushSize} strength={toolStrength} selection={selection} locked={selectedLocked} onChange={onRasterChange} onCommit={onRasterCommit} />}
            <TransformOverlay canvasRef={canvasRef} document={document} assets={assets} dispatch={dispatch} endHistoryGroup={endHistoryGroup} enabled={tool === 'move' || tool === 'object-select'} />
            <CanvasActionOverlay canvasRef={canvasRef} tool={tool} onColorSample={onForegroundColorChange} onAddText={(position) => onAddText(position, foregroundColor)} onAddShape={(shape, position) => onAddShape(shape, position, foregroundColor)} onZoom={changeZoom} />
          </div>
        </div>

        {isDraggingFile && (
          <div className="absolute inset-4 z-20 flex items-center justify-center rounded-2xl border border-dashed border-violet-400/70 bg-violet-500/10 backdrop-blur-md">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-violet-400 text-violet-950"><UploadIcon className="size-5" /></span>
              <p className="text-sm font-semibold text-white">Drop to add an image layer</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex h-11 shrink-0 items-center justify-center border-t border-white/[0.06] px-4 text-[10px] text-zinc-700">
        {toolHint}
      </div>
    </section>
  )
}
