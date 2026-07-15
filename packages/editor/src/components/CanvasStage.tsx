import { useEffect, useState, type RefObject } from 'react'
import { getDocumentSize } from '../editor/presets'
import { getLayerBounds } from '../editor/renderer'
import { layerIsLocked } from '../editor/stack'
import type { AssetMap, EditorDispatch, EditorDocument } from '../editor/types'
import { extractImageData, type RasterEdit } from '../editor/raster'
import { applySelectionShape, selectionAlphaAt, type SelectionMode, type SelectionState } from '../editor/selection'
import { ImageIcon, RedoIcon, UndoIcon, UploadIcon } from './Icons'
import { RasterPaintOverlay } from './RasterPaintOverlay'
import { SelectionOverlay } from './SelectionOverlay'
import { TransformOverlay } from './TransformOverlay'

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
  onRasterChange: (assetId: string) => void
  onRasterCommit: (edit: RasterEdit) => void
  editingMaskLayerId: string | null
  selectionResetToken: number
}

export function CanvasStage({ canvasRef, document, assets, dispatch, endHistoryGroup, isLoading, onFile, canUndo, canRedo, onUndo, onRedo, onAlign, onRasterChange, onRasterCommit, editingMaskLayerId, selectionResetToken }: CanvasStageProps) {
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [tool, setTool] = useState<'move' | 'brush' | 'eraser' | 'marquee' | 'ellipse-select'>('move')
  const [brushSize, setBrushSize] = useState(48)
  const [brushColor, setBrushColor] = useState('#ff3b81')
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('replace')
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const preset = getDocumentSize(document)
  const selected = document.layers.find((layer) => layer.id === document.selectedLayerId)
  const selectedGroup = document.groups.find((group) => group.id === document.selectedGroupId)
  const selectedLocked = selected ? layerIsLocked(document, selected) : false
  const editingMaskLayer = document.layers.find((layer) => layer.id === editingMaskLayerId && layer.id === document.selectedLayerId && layer.maskAssetId)
  const selectionTool = tool === 'marquee' || tool === 'ellipse-select'

  useEffect(() => setSelection(null), [preset.height, preset.width])
  useEffect(() => setSelection(null), [selectionResetToken])
  useEffect(() => { if (editingMaskLayerId) setTool('brush') }, [editingMaskLayerId])

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
        onRasterChange(targetAssetId)
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
  }, [assets, canvasRef, editingMaskLayer, onRasterChange, onRasterCommit, preset.height, preset.width, selected, selectedLocked, selection])

  return (
    <section
      className="order-1 flex min-h-[560px] min-w-0 flex-1 flex-col overflow-hidden bg-[#0b0b0c] lg:order-2 lg:h-[calc(100vh-48px)] lg:min-h-0"
      onDragEnter={(event) => { event.preventDefault(); setIsDraggingFile(true) }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDraggingFile(false) }}
      onDrop={(event) => {
        event.preventDefault()
        setIsDraggingFile(false)
        const file = event.dataTransfer.files[0]
        if (file) onFile(file)
      }}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] px-4 sm:px-5">
        <div className="hidden min-w-0 items-center gap-2 text-xs text-zinc-500 sm:flex">
          <ImageIcon className="size-4 shrink-0 text-zinc-600" />
          <span className="max-w-48 truncate sm:max-w-72">{selectedGroup?.name ?? (document.selectedLayerIds.length > 1 ? `${document.selectedLayerIds.length} layers selected` : selected?.name ?? 'Canvas')}</span>
          {editingMaskLayer && <span className="rounded bg-cyan-400/10 px-1.5 py-0.5 text-[9px] text-cyan-200/80">Mask</span>}
          {selected?.locked && <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-300/70">Locked</span>}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-md border border-white/[0.06] bg-black/20 p-0.5">
            {[
              { value: 'move', label: 'Move', short: 'V', aria: 'Move tool' },
              { value: 'brush', label: 'Brush', short: 'B', aria: 'Brush tool' },
              { value: 'eraser', label: 'Erase', short: 'E', aria: 'Eraser tool' },
              { value: 'marquee', label: 'Rect', short: 'R', aria: 'Rectangular marquee tool' },
              { value: 'ellipse-select', label: 'Oval', short: 'O', aria: 'Elliptical marquee tool' },
            ].map((item) => (
              <button key={item.value} type="button" aria-label={item.aria} aria-pressed={tool === item.value} onClick={() => setTool(item.value as typeof tool)} className={`rounded px-1.5 py-1 text-[9px] font-medium ${tool === item.value ? 'bg-violet-400/15 text-violet-200' : 'text-zinc-600 hover:text-zinc-300'}`}><span className="sm:hidden">{item.short}</span><span className="hidden sm:inline">{item.label}</span></button>
            ))}
          </div>
          {(tool === 'brush' || tool === 'eraser') && (
            <div className="hidden items-center gap-2 lg:flex">
              <input aria-label="Brush size" type="range" min="2" max="240" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} className="studio-range w-20" />
              <span className="w-7 font-mono text-[9px] text-zinc-600">{brushSize}</span>
              {tool === 'brush' && <input aria-label="Brush color" type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />}
            </div>
          )}
          {selectionTool && (
            <div className="hidden items-center rounded-md border border-white/[0.06] bg-black/20 p-0.5 lg:flex">
              {(['replace', 'add', 'subtract', 'intersect'] as SelectionMode[]).map((value) => <button key={value} type="button" aria-label={`${value} selection`} aria-pressed={selectionMode === value} onClick={() => setSelectionMode(value)} className={`rounded px-1.5 py-1 text-[9px] capitalize ${selectionMode === value ? 'bg-violet-400/15 text-violet-200' : 'text-zinc-600 hover:text-zinc-300'}`}>{value}</button>)}
              {selection && <button type="button" aria-label="Clear selection" onClick={() => setSelection(null)} className="rounded px-1.5 py-1 text-[9px] text-zinc-600 hover:text-zinc-200">Clear</button>}
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
            <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(50, value - 25))} className="flex size-6 items-center justify-center rounded text-xs text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300">−</button>
            <button type="button" title="Reset zoom" onClick={() => setZoom(100)} className="w-10 text-center font-mono text-[9px] text-zinc-500">{zoom}%</button>
            <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(200, value + 25))} className="flex size-6 items-center justify-center rounded text-xs text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300">+</button>
          </div>
        </div>
      </div>

      <div className="stage-grid relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-5 sm:p-8 lg:p-10">
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
            <SelectionOverlay canvasRef={canvasRef} enabled={selectionTool} kind={tool === 'ellipse-select' ? 'ellipse' : 'rectangle'} mode={selectionMode} selection={selection} onChange={setSelection} />
            {(tool === 'brush' || tool === 'eraser') && <RasterPaintOverlay canvasRef={canvasRef} document={document} assets={assets} tool={tool} size={brushSize} color={brushColor} opacity={100} selection={selection} maskAssetId={editingMaskLayer?.maskAssetId ?? undefined} maskLocked={editingMaskLayer?.locked} locked={selectedLocked} onChange={onRasterChange} onCommit={onRasterCommit} />}
            <TransformOverlay canvasRef={canvasRef} document={document} assets={assets} dispatch={dispatch} endHistoryGroup={endHistoryGroup} enabled={tool === 'move'} />

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
        {selectionTool ? `Drag to make a ${tool === 'marquee' ? 'rectangular' : 'elliptical'} selection · Shift constrains · Alt draws from centre` : tool === 'move' ? 'Click to select · drag to move · Shift-click for multi-select · drag handles to transform' : editingMaskLayer ? `${tool === 'brush' ? 'Reveal' : 'Hide'} pixels on ${editingMaskLayer.name}’s mask${selection ? ' inside the current selection' : ''} · undo with ⌘Z` : selected?.type === 'raster' ? `${tool === 'brush' ? 'Paint' : 'Erase'} ${selection ? 'inside the current selection' : 'directly on the selected raster layer'} · undo with ⌘Z` : 'Select a raster layer to paint'}
      </div>
    </section>
  )
}
