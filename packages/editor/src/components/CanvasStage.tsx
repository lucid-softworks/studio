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
import { PolygonalLassoOverlay } from './PolygonalLassoOverlay'
import { MagicWandOverlay } from './MagicWandOverlay'
import { MeasureOverlay, type Measurement } from './MeasureOverlay'
import { RasterFillOverlay } from './RasterFillOverlay'
import { RasterPaintOverlay } from './RasterPaintOverlay'
import { SelectionOverlay } from './SelectionOverlay'
import { SingleMarqueeOverlay } from './SingleMarqueeOverlay'
import type { EditorTool } from './ToolRail'
import { TransformOverlay } from './TransformOverlay'
import { PathEditorOverlay } from './PathEditorOverlay'
import { WarpOverlay } from './WarpOverlay'
import { PerspectiveCropOverlay } from './PerspectiveCropOverlay'
import { defaultBrushDynamics, type BrushDynamics, type BrushPreset } from '../editor/resources'
import { BrushSettingsPopover } from './BrushSettingsPopover'
import { CanvasRulers } from './CanvasRulers'
import { QuickMaskOverlay } from './QuickMaskOverlay'
import { PixelRetouchOverlay } from './PixelRetouchOverlay'
import type { GradientStop } from '../editor/gradients'

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
  onAddText: (position: Position, color: string, paragraphBox?: { width: number; height: number }) => void
  onAddShape: (shape: ShapeKind, position: Position, fill: string) => void
  onCrop: (bounds: NonNullable<SelectionState['bounds']>) => void
  onPerspectiveCrop: (quad: [Position, Position, Position, Position]) => void
  brushes: BrushPreset[]
  brushId: string
  onBrushChange: (id: string) => void
  onLoadBrush: () => void
  foregroundColor: string
  backgroundColor: string
  gradientStops: GradientStop[]
  onForegroundColorChange: (color: string) => void
  onBackgroundColorChange: (color: string) => void
}

type ToolPreset = {
  id: string
  name: string
  tool: EditorTool
  brushId: string
  size: number
  hardness: number
  opacity: number
  flow: number
  strength: number
  dynamics: BrushDynamics
}

function loadToolPresets(): ToolPreset[] {
  try {
    const value = JSON.parse(localStorage.getItem('studio.tool-presets') ?? '[]') as unknown
    if (!Array.isArray(value)) return []
    return value.flatMap((entry): ToolPreset[] => {
      if (!entry || typeof entry !== 'object') return []
      const preset = entry as Partial<ToolPreset>
      if (typeof preset.id !== 'string' || typeof preset.name !== 'string' || typeof preset.tool !== 'string') return []
      return [{ id: preset.id, name: preset.name.slice(0, 48), tool: preset.tool as EditorTool, brushId: preset.brushId ?? 'round', size: Math.max(2, Math.min(240, preset.size ?? 48)), hardness: Math.max(0, Math.min(100, preset.hardness ?? 80)), opacity: Math.max(1, Math.min(100, preset.opacity ?? 100)), flow: Math.max(1, Math.min(100, preset.flow ?? 100)), strength: Math.max(1, Math.min(100, preset.strength ?? 45)), dynamics: { ...defaultBrushDynamics, ...preset.dynamics } }]
    }).slice(0, 64)
  } catch { return [] }
}

const toolNames: Record<EditorTool, string> = {
  move: 'Move',
  marquee: 'Rectangular Marquee',
  'ellipse-select': 'Elliptical Marquee',
  'single-row-select': 'Single Row Marquee',
  'single-column-select': 'Single Column Marquee',
  lasso: 'Lasso',
  'polygonal-lasso': 'Polygonal Lasso',
  'magnetic-lasso': 'Magnetic Lasso',
  'magic-wand': 'Magic Wand',
  'object-select': 'Object Select',
  crop: 'Crop',
  'perspective-crop': 'Perspective Crop',
  eyedropper: 'Eyedropper',
  measure: 'Measure',
  healing: 'Healing Brush',
  'clone-stamp': 'Clone Stamp',
  brush: 'Brush',
  pencil: 'Pencil',
  'color-replacement': 'Color Replacement',
  'mixer-brush': 'Mixer Brush',
  'history-brush': 'History Brush',
  eraser: 'Eraser',
  fill: 'Paint Bucket',
  gradient: 'Gradient',
  dodge: 'Dodge',
  burn: 'Burn',
  'pattern-stamp': 'Pattern Stamp',
  sponge: 'Sponge',
  blur: 'Blur',
  sharpen: 'Sharpen',
  smudge: 'Smudge',
  text: 'Type',
  pen: 'Pen',
  'direct-select': 'Direct Selection',
  'path-select': 'Path Selection',
  warp: 'Warp',
  'puppet-warp': 'Puppet Warp',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  hand: 'Hand',
  zoom: 'Zoom',
}

function toolForShortcut(key: string, shift: boolean): EditorTool | null {
  switch (key) {
    case 'v': return 'move'
    case 'm': return shift ? 'ellipse-select' : 'marquee'
    case 'l': return shift ? 'polygonal-lasso' : 'lasso'
    case 'w': return shift ? 'object-select' : 'magic-wand'
    case 'c': return shift ? 'perspective-crop' : 'crop'
    case 'i': return shift ? 'measure' : 'eyedropper'
    case 'j': return 'healing'
    case 's': return 'clone-stamp'
    case 'b': return shift ? 'pencil' : 'brush'
    case 'y': return 'history-brush'
    case 'e': return 'eraser'
    case 'g': return shift ? 'gradient' : 'fill'
    case 'o': return shift ? 'burn' : 'dodge'
    case 't': return 'text'
    case 'p': return 'pen'
    case 'a': return shift ? 'path-select' : 'direct-select'
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
    case 'single-row-select': return 'Click to select one horizontal row of pixels'
    case 'single-column-select': return 'Click to select one vertical column of pixels'
    case 'lasso': return 'Draw a freehand boundary to select an irregular area'
    case 'polygonal-lasso': return 'Click to add straight segments · double-click or click the first point to close'
    case 'magnetic-lasso': return 'Draw near a high-contrast boundary to snap the selection edge locally'
    case 'magic-wand': return 'Click a contiguous colour region to select it'
    case 'object-select': return 'Click a connected visible object to select its pixel silhouette'
    case 'crop': return context.hasCrop ? 'Adjust the crop region or apply it from the options bar' : 'Drag over the canvas to define a crop region'
    case 'perspective-crop': return 'Drag four corners around a plane, then rectify it into a new canvas'
    case 'move': return 'Click to select · drag handles to transform · Ctrl-drag a corner to distort · add Shift for perspective'
    case 'eyedropper': return 'Click the canvas to sample a foreground colour'
    case 'measure': return 'Drag between two points to measure their heading · Shift snaps to 45° · straighten the selected layer from the options bar'
    case 'fill': return 'Click a contiguous area on the selected raster layer to fill it'
    case 'gradient': return 'Drag across the selected raster layer to paint a linear gradient'
    case 'healing':
    case 'clone-stamp': return 'Alt-click to choose a source · drag to paint from it'
    case 'dodge': return 'Drag to lighten pixels on the selected raster layer'
    case 'burn': return 'Drag to darken pixels on the selected raster layer'
    case 'color-replacement': return 'Drag to replace the sampled colour while preserving local edges and alpha'
    case 'mixer-brush': return 'Drag to mix a sampled paint reservoir into the selected raster layer'
    case 'history-brush': return 'Drag to restore pixels from the layer state captured when this tool was selected'
    case 'pattern-stamp': return 'Drag to paint the active local pattern'
    case 'sponge': return 'Drag to increase local colour saturation'
    case 'blur': return 'Drag to soften local detail'
    case 'sharpen': return 'Drag to increase local edge contrast'
    case 'smudge': return 'Drag pixels along the stroke direction'
    case 'text': return 'Click the canvas to add a text layer'
    case 'pen': return 'Click to add points · drag for Bézier handles · click the first point to close'
    case 'direct-select': return 'Drag anchors or handles · Alt-click an anchor to convert it · Delete removes it'
    case 'path-select': return 'Drag a complete path component to reposition it'
    case 'warp': return 'Drag mesh points to apply a reusable multi-point warp'
    case 'puppet-warp': return 'Click to add pins · drag pins to deform the selected layer'
    case 'rectangle': return 'Click the canvas to add a rectangle layer'
    case 'ellipse': return 'Click the canvas to add an ellipse layer'
    case 'hand': return 'Drag the workspace to pan around the document'
    case 'zoom': return 'Click to zoom in · Alt-click to zoom out'
    case 'brush':
    case 'pencil':
    case 'eraser':
      if (context.editingMaskName) return `${tool === 'eraser' ? 'Hide' : 'Reveal'} pixels on ${context.editingMaskName}’s mask${context.hasSelection ? ' inside the current selection' : ''} · undo with ⌘Z`
      if (context.rasterSelected) return `${tool === 'eraser' ? 'Erase' : tool === 'pencil' ? 'Draw aliased pixels' : 'Paint'} ${context.hasSelection ? 'inside the current selection' : 'directly on the selected raster layer'} · undo with ⌘Z`
      return 'Select a raster layer to paint'
  }
}

export function CanvasStage({ canvasRef, document, assets, dispatch, endHistoryGroup, isLoading, onFile, canUndo, canRedo, onUndo, onRedo, onAlign, onRasterChange, onRasterCommit, editingMaskLayerId, selection, onSelectionChange: setSelection, zoom, onZoomChange: setZoom, tool, onToolChange, onAddText, onAddShape, onCrop, onPerspectiveCrop, brushes, brushId, onBrushChange, onLoadBrush, foregroundColor, backgroundColor, gradientStops, onForegroundColorChange, onBackgroundColorChange }: CanvasStageProps) {
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [brushSize, setBrushSize] = useState(48)
  const [brushHardness, setBrushHardness] = useState(80)
  const [brushOpacity, setBrushOpacity] = useState(100)
  const [brushFlow, setBrushFlow] = useState(100)
  const [brushSpacing, setBrushSpacing] = useState(12)
  const [pressureSize, setPressureSize] = useState(true)
  const [pressureOpacity, setPressureOpacity] = useState(false)
  const [brushDynamics, setBrushDynamics] = useState<BrushDynamics>(defaultBrushDynamics)
  const [pressureCalibration, setPressureCalibration] = useState({ minimum: 0, maximum: 1, gamma: 1 })
  const [toolStrength, setToolStrength] = useState(45)
  const [toolPresets, setToolPresets] = useState<ToolPreset[]>(loadToolPresets)
  const [cloneAligned, setCloneAligned] = useState(true)
  const [cloneSampleMode, setCloneSampleMode] = useState<'current' | 'current-and-below'>('current-and-below')
  const [cloneRotation, setCloneRotation] = useState(0)
  const [cloneScale, setCloneScale] = useState(100)
  const [tolerance, setTolerance] = useState(32)
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('replace')
  const [quickMask, setQuickMask] = useState(false)
  const [cropSelection, setCropSelection] = useState<SelectionState | null>(null)
  const [perspectiveCrop, setPerspectiveCrop] = useState<[Position, Position, Position, Position]>(() => [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 700 }, { x: 100, y: 700 }])
  const [measurement, setMeasurement] = useState<Measurement | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [splitView, setSplitView] = useState(false)
  const [viewsLinked, setViewsLinked] = useState(true)
  const [viewRotation, setViewRotation] = useState(0)
  const [secondaryZoom, setSecondaryZoom] = useState(100)
  const [secondaryRotation, setSecondaryRotation] = useState(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const secondaryCanvasRef = useRef<HTMLCanvasElement>(null)
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null)
  const zoomScrubRef = useRef<{ pointerId: number; x: number; zoom: number; moved: boolean } | null>(null)
  const suppressZoomResetRef = useRef(false)
  const preset = getDocumentSize(document)
  const selected = document.layers.find((layer) => layer.id === document.selectedLayerId)
  const selectedGroup = document.groups.find((group) => group.id === document.selectedGroupId)
  const selectedLocked = selected ? layerIsLocked(document, selected) : false
  const editingMaskLayer = document.layers.find((layer) => layer.id === editingMaskLayerId && layer.id === document.selectedLayerId && layer.maskAssetId)
  const selectionTool = tool === 'marquee' || tool === 'ellipse-select' || tool === 'single-row-select' || tool === 'single-column-select' || tool === 'lasso' || tool === 'polygonal-lasso' || tool === 'magnetic-lasso' || tool === 'magic-wand' || tool === 'object-select'
  const paintTool = tool === 'brush' || tool === 'pencil' || tool === 'eraser' || tool === 'dodge' || tool === 'burn'
  const selectedBrush = brushes.find((candidate) => candidate.id === brushId) ?? brushes[0]
  const brush = { ...selectedBrush, spacing: brushSpacing }
  const retouchTool = tool === 'healing' || tool === 'clone-stamp'
  const pixelRetouchTool = tool === 'color-replacement' || tool === 'mixer-brush' || tool === 'history-brush' || tool === 'pattern-stamp' || tool === 'sponge' || tool === 'blur' || tool === 'sharpen' || tool === 'smudge' ? tool : null
  const measurementAngle = measurement ? Math.atan2(measurement.endY - measurement.startY, measurement.endX - measurement.startX) * 180 / Math.PI : 0
  const measurementLength = measurement ? Math.hypot(measurement.endX - measurement.startX, measurement.endY - measurement.startY) : 0

  useEffect(() => setBrushSpacing(selectedBrush.spacing), [selectedBrush.id, selectedBrush.spacing])
  useEffect(() => setBrushDynamics({ ...defaultBrushDynamics, ...selectedBrush.dynamics }), [selectedBrush.id, selectedBrush.dynamics])
  useEffect(() => {
    try {
      const stored = localStorage.getItem('studio.tablet-calibration')
      if (stored) setPressureCalibration({ ...pressureCalibration, ...JSON.parse(stored) })
    } catch { /* Device calibration is optional. */ }
  // Calibration is restored once for this editor session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    try { localStorage.setItem('studio.tablet-calibration', JSON.stringify(pressureCalibration)) } catch { /* Device calibration is optional. */ }
  }, [pressureCalibration])
  useEffect(() => {
    try { localStorage.setItem('studio.tool-presets', JSON.stringify(toolPresets)) } catch { /* Presets are optional. */ }
  }, [toolPresets])
  useEffect(() => setSelection(null), [preset.height, preset.width, setSelection])
  useEffect(() => setCropSelection(null), [preset.height, preset.width])
  useEffect(() => { if (tool !== 'crop') setCropSelection(null) }, [tool])
  useEffect(() => { if (tool === 'perspective-crop') setPerspectiveCrop([{ x: preset.width * 0.1, y: preset.height * 0.1 }, { x: preset.width * 0.9, y: preset.height * 0.1 }, { x: preset.width * 0.9, y: preset.height * 0.9 }, { x: preset.width * 0.1, y: preset.height * 0.9 }]) }, [preset.height, preset.width, tool])
  useEffect(() => { if (editingMaskLayerId) onToolChange('brush') }, [editingMaskLayerId, onToolChange])

  useEffect(() => {
    if (!splitView) return
    let secondFrame = 0
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const source = canvasRef.current
        const target = secondaryCanvasRef.current
        const context = target?.getContext('2d')
        if (!source || !target || !context) return
        target.width = source.width
        target.height = source.height
        context.clearRect(0, 0, target.width, target.height)
        context.drawImage(source, 0, 0)
      })
    })
    return () => {
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
    }
  })

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const scrub = zoomScrubRef.current
      if (!scrub || scrub.pointerId !== event.pointerId) return
      if (Math.abs(event.clientX - scrub.x) > 2) scrub.moved = true
      setZoom(Math.max(25, Math.min(400, Math.round(scrub.zoom + (event.clientX - scrub.x) * 1.5))))
    }
    const onPointerUp = (event: PointerEvent) => {
      if (zoomScrubRef.current?.pointerId === event.pointerId) {
        suppressZoomResetRef.current = zoomScrubRef.current.moved
        zoomScrubRef.current = null
      }
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [setZoom])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]') || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.toLowerCase() === 'q') {
        event.preventDefault()
        setQuickMask((current) => !current)
        if (tool !== 'brush' && tool !== 'eraser') onToolChange('brush')
        return
      }
      const next = toolForShortcut(event.key.toLowerCase(), event.shiftKey)
      if (!next) return
      event.preventDefault()
      onToolChange(next)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onToolChange, tool])

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

  const applyToolPreset = (id: string) => {
    const preset = toolPresets.find((candidate) => candidate.id === id)
    if (!preset) return
    onToolChange(preset.tool)
    if (brushes.some((brush) => brush.id === preset.brushId)) onBrushChange(preset.brushId)
    setBrushSize(preset.size)
    setBrushHardness(preset.hardness)
    setBrushOpacity(preset.opacity)
    setBrushFlow(preset.flow)
    setToolStrength(preset.strength)
    setBrushDynamics(preset.dynamics)
  }

  const saveToolPreset = () => {
    const name = window.prompt('Tool preset name', `${toolNames[tool]} preset`)?.trim().slice(0, 48)
    if (!name) return
    const preset: ToolPreset = { id: crypto.randomUUID(), name, tool, brushId: brush.id, size: brushSize, hardness: brushHardness, opacity: brushOpacity, flow: brushFlow, strength: toolStrength, dynamics: brushDynamics }
    setToolPresets((current) => [...current, preset].slice(-64))
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
      className="order-1 flex min-h-[560px] min-w-0 flex-1 flex-col overflow-hidden bg-[#0b0b0c] lg:order-2 lg:h-[calc(100vh-84px)] lg:min-h-0"
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
          {(paintTool || retouchTool || pixelRetouchTool) && (
            <div className="hidden items-center gap-2 md:flex">
              <select aria-label="Tool preset" defaultValue="" onChange={(event) => { applyToolPreset(event.target.value); event.target.value = '' }} className="max-w-28 rounded-md border border-white/[0.08] bg-black/25 px-2 py-1.5 text-[9px] text-zinc-400 outline-none"><option value="" disabled>Tool presets</option>{toolPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select><button type="button" aria-label="Save tool preset" title="Save current tool settings" onClick={saveToolPreset} className="rounded-md border border-white/[0.08] px-2 py-1.5 text-[9px] text-zinc-500 hover:text-zinc-200">+</button>{toolPresets.length > 0 && <button type="button" aria-label="Delete last tool preset" title={`Delete ${toolPresets.at(-1)?.name}`} onClick={() => setToolPresets((current) => current.slice(0, -1))} className="rounded-md px-1 py-1.5 text-[9px] text-zinc-700 hover:text-red-300">×</button>}
              {paintTool && <><select aria-label="Brush preset" value={brush.id} onChange={(event) => changeBrush(event.target.value)} className="max-w-28 rounded-md border border-white/[0.08] bg-black/25 px-2 py-1.5 text-[9px] text-zinc-400 outline-none"><option value="round">Round</option>{brushes.filter((preset) => !preset.builtIn).map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select><button type="button" onClick={onLoadBrush} className="rounded-md border border-white/[0.08] px-2 py-1.5 text-[9px] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200">Load…</button><BrushSettingsPopover hardness={brushHardness} opacity={brushOpacity} flow={brushFlow} spacing={brushSpacing} pressureSize={pressureSize} pressureOpacity={pressureOpacity} supportsHardness={!brush.tip} onHardnessChange={setBrushHardness} onOpacityChange={setBrushOpacity} onFlowChange={setBrushFlow} onSpacingChange={setBrushSpacing} onPressureSizeChange={setPressureSize} onPressureOpacityChange={setPressureOpacity} dynamics={brushDynamics} onDynamicsChange={setBrushDynamics} calibration={pressureCalibration} onCalibrationChange={setPressureCalibration} /></>}
              <input aria-label="Brush size" type="range" min="2" max="240" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} className="studio-range w-20" />
              <span className="w-7 font-mono text-[9px] text-zinc-600">{brushSize}</span>
              {(tool === 'brush' || tool === 'pencil' || tool === 'color-replacement' || tool === 'mixer-brush' || tool === 'pattern-stamp') && <input aria-label="Brush color" type="color" value={foregroundColor} onChange={(event) => onForegroundColorChange(event.target.value)} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />}
              {(retouchTool || pixelRetouchTool || tool === 'dodge' || tool === 'burn') && <><span className="text-[9px] text-zinc-600">Strength</span><input aria-label="Tool strength" type="range" min="5" max="100" value={toolStrength} onChange={(event) => setToolStrength(Number(event.target.value))} className="studio-range w-16" /><span className="w-7 font-mono text-[9px] text-zinc-600">{toolStrength}%</span></>}
              {retouchTool && <div className="hidden items-center gap-1 xl:flex"><select aria-label="Clone sample mode" value={cloneSampleMode} onChange={(event) => setCloneSampleMode(event.target.value as typeof cloneSampleMode)} className="rounded-md border border-white/[0.08] bg-black/25 px-1.5 py-1 text-[9px] text-zinc-400"><option value="current">Current</option><option value="current-and-below">Current &amp; below</option></select><label className="flex items-center gap-1 text-[9px] text-zinc-600"><input type="checkbox" checked={cloneAligned} onChange={(event) => setCloneAligned(event.target.checked)} />Aligned</label><label className="flex items-center gap-1 text-[9px] text-zinc-600">∠<input aria-label="Clone source rotation" type="number" min="-180" max="180" value={cloneRotation} onChange={(event) => setCloneRotation(Math.max(-180, Math.min(180, Number(event.target.value))))} className="w-12 rounded border border-white/[0.08] bg-black/25 px-1 py-1 font-mono" /></label><label className="flex items-center gap-1 text-[9px] text-zinc-600">%<input aria-label="Clone source scale" type="number" min="10" max="400" value={cloneScale} onChange={(event) => setCloneScale(Math.max(10, Math.min(400, Number(event.target.value))))} className="w-12 rounded border border-white/[0.08] bg-black/25 px-1 py-1 font-mono" /></label></div>}
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
          {(selection || quickMask) && <button type="button" aria-pressed={quickMask} onClick={() => { setQuickMask((current) => !current); if (!quickMask && tool !== 'brush' && tool !== 'eraser') onToolChange('brush') }} className={`rounded-md border px-2 py-1.5 text-[9px] ${quickMask ? 'border-rose-300/30 bg-rose-400/15 text-rose-100' : 'border-white/[0.07] text-zinc-600 hover:text-zinc-200'}`}>Quick Mask · Q</button>}
          {tool === 'crop' && <div className="flex items-center gap-1"><button type="button" disabled={!cropSelection?.bounds} onClick={() => { if (cropSelection?.bounds) { onCrop(cropSelection.bounds); setCropSelection(null); onToolChange('move') } }} className="rounded-md bg-violet-500 px-2.5 py-1.5 text-[9px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-30">Apply crop</button><button type="button" onClick={() => { setCropSelection(null); onToolChange('move') }} className="rounded-md px-2 py-1.5 text-[9px] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200">Cancel</button></div>}
          {tool === 'perspective-crop' && <div className="flex items-center gap-1"><button type="button" onClick={() => { onPerspectiveCrop(perspectiveCrop); onToolChange('move') }} className="rounded-md bg-violet-500 px-2.5 py-1.5 text-[9px] font-semibold text-white">Rectify crop</button><button type="button" onClick={() => onToolChange('move')} className="rounded-md px-2 py-1.5 text-[9px] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200">Cancel</button></div>}
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
          <div className="hidden items-center rounded-md border border-white/[0.06] bg-black/20 p-0.5 xl:flex">
            <button type="button" aria-label="Rotate view left" title="Rotate view left" onClick={() => setViewRotation((value) => value - 15)} className="flex h-6 items-center rounded px-1.5 text-[9px] text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300">↶</button>
            <button type="button" title="Reset view rotation" onClick={() => setViewRotation(0)} className="min-w-10 px-1 font-mono text-[9px] text-zinc-500">{viewRotation}°</button>
            <button type="button" aria-label="Rotate view right" title="Rotate view right" onClick={() => setViewRotation((value) => value + 15)} className="flex h-6 items-center rounded px-1.5 text-[9px] text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300">↷</button>
            <button type="button" aria-pressed={splitView} onClick={() => setSplitView((value) => !value)} className={`ml-1 rounded px-1.5 py-1 text-[9px] ${splitView ? 'bg-violet-400/15 text-violet-200' : 'text-zinc-600 hover:text-zinc-300'}`}>Split</button>
          </div>
          <div className="flex items-center rounded-md border border-white/[0.06] bg-black/20 p-0.5">
            <button type="button" aria-label="Zoom out" onClick={() => changeZoom('out')} className="flex size-6 items-center justify-center rounded text-xs text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300">−</button>
            <button type="button" title="Drag horizontally for scrubby zoom · click to reset" onClick={() => { if (suppressZoomResetRef.current) { suppressZoomResetRef.current = false; return } setZoom(100) }} onPointerDown={(event) => { zoomScrubRef.current = { pointerId: event.pointerId, x: event.clientX, zoom, moved: false }; event.currentTarget.setPointerCapture(event.pointerId) }} className="w-10 cursor-ew-resize text-center font-mono text-[9px] text-zinc-500">{zoom}%</button>
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
        <CanvasRulers stageRef={stageRef} canvasRef={canvasRef} zoom={zoom} guides={document.guides} grid={document.grid} artboards={document.artboards} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(79,70,229,0.08),transparent_42%)]" />
        <div className={`relative z-10 grid w-full max-w-full shrink-0 items-center gap-3 ${splitView ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div className="flex min-w-0 items-center justify-center transition-transform duration-150" style={{ aspectRatio: `${preset.width} / ${preset.height}`, transform: `scale(${zoom / 100}) rotate(${viewRotation}deg)` }}>
            <div className="transparency-grid relative inline-flex max-h-full max-w-full">
            <canvas
              ref={canvasRef}
              width={preset.width}
              height={preset.height}
              aria-label="Composition canvas"
              className={`block h-auto w-auto max-h-[calc(100vh-205px)] max-w-full rounded-sm shadow-[0_28px_80px_rgba(0,0,0,0.5)] transition-opacity ${isLoading ? 'opacity-50' : 'opacity-100'}`}
            />
            <SelectionOverlay canvasRef={canvasRef} enabled={tool === 'marquee' || tool === 'ellipse-select'} kind={tool === 'ellipse-select' ? 'ellipse' : 'rectangle'} mode={selectionMode} selection={selection} onChange={setSelection} />
            <SingleMarqueeOverlay canvasRef={canvasRef} enabled={tool === 'single-row-select' || tool === 'single-column-select'} kind={tool === 'single-column-select' ? 'column' : 'row'} mode={selectionMode} selection={selection} onChange={setSelection} />
            <LassoSelectionOverlay canvasRef={canvasRef} enabled={tool === 'lasso' || tool === 'magnetic-lasso'} magnetic={tool === 'magnetic-lasso'} mode={selectionMode} selection={selection} onChange={setSelection} />
            <PolygonalLassoOverlay canvasRef={canvasRef} enabled={tool === 'polygonal-lasso'} mode={selectionMode} selection={selection} onChange={setSelection} />
            <MagicWandOverlay canvasRef={canvasRef} enabled={tool === 'magic-wand' || tool === 'object-select'} object={tool === 'object-select'} mode={selectionMode} tolerance={tolerance} selection={selection} onChange={setSelection} />
            <MeasureOverlay canvasRef={canvasRef} enabled={tool === 'measure'} value={measurement} onChange={setMeasurement} />
            <SelectionOverlay canvasRef={canvasRef} enabled={tool === 'crop'} kind="rectangle" mode="replace" selection={cropSelection} onChange={setCropSelection} />
            <PerspectiveCropOverlay canvasRef={canvasRef} enabled={tool === 'perspective-crop'} value={perspectiveCrop} onChange={setPerspectiveCrop} />
            <QuickMaskOverlay canvasRef={canvasRef} enabled={quickMask && (tool === 'brush' || tool === 'eraser')} tool={tool === 'eraser' ? 'eraser' : 'brush'} size={brushSize} selection={selection} onChange={setSelection} />
            {paintTool && !quickMask && <RasterPaintOverlay canvasRef={canvasRef} document={document} assets={assets} tool={tool} brush={brush} size={brushSize} color={foregroundColor} hardness={brushHardness} opacity={tool === 'dodge' || tool === 'burn' ? toolStrength : brushOpacity} flow={brushFlow} pressureSize={pressureSize} pressureOpacity={pressureOpacity} dynamics={brushDynamics} pressureCalibration={pressureCalibration} selection={selection} maskAssetId={editingMaskLayer?.maskAssetId ?? undefined} maskLocked={editingMaskLayer?.locked} locked={selectedLocked} onChange={onRasterChange} onCommit={onRasterCommit} />}
            {(tool === 'fill' || tool === 'gradient') && <RasterFillOverlay canvasRef={canvasRef} document={document} assets={assets} tool={tool} color={foregroundColor} secondaryColor={backgroundColor} gradientStops={gradientStops.map((stop, index) => ({ ...stop, color: index === 0 ? foregroundColor : index === gradientStops.length - 1 ? backgroundColor : stop.color }))} tolerance={tolerance} selection={selection} maskAssetId={editingMaskLayer?.maskAssetId ?? undefined} maskLocked={editingMaskLayer?.locked} locked={selectedLocked} onChange={onRasterChange} onCommit={onRasterCommit} />}
            {retouchTool && <CloneStampOverlay canvasRef={canvasRef} document={document} assets={assets} tool={tool} size={brushSize} strength={toolStrength} aligned={cloneAligned} sampleMode={cloneSampleMode} sourceRotation={cloneRotation} sourceScale={cloneScale} selection={selection} locked={selectedLocked} onChange={onRasterChange} onCommit={onRasterCommit} />}
            {pixelRetouchTool && <PixelRetouchOverlay canvasRef={canvasRef} document={document} assets={assets} tool={pixelRetouchTool} size={brushSize} strength={toolStrength} color={foregroundColor} selection={selection} locked={selectedLocked} onChange={onRasterChange} onCommit={onRasterCommit} />}
            <PathEditorOverlay canvasRef={canvasRef} document={document} dispatch={dispatch} endHistoryGroup={endHistoryGroup} tool={tool === 'direct-select' || tool === 'path-select' ? tool : 'pen'} enabled={tool === 'pen' || tool === 'direct-select' || tool === 'path-select'} />
            <WarpOverlay canvasRef={canvasRef} document={document} assets={assets} dispatch={dispatch} endHistoryGroup={endHistoryGroup} mode={tool === 'puppet-warp' ? 'puppet' : 'warp'} enabled={tool === 'warp' || tool === 'puppet-warp'} />
            <TransformOverlay canvasRef={canvasRef} document={document} assets={assets} dispatch={dispatch} endHistoryGroup={endHistoryGroup} enabled={tool === 'move'} />
            <CanvasActionOverlay canvasRef={canvasRef} tool={tool} onColorSample={onForegroundColorChange} onAddText={(position, paragraphBox) => onAddText(position, foregroundColor, paragraphBox)} onAddShape={(shape, position) => onAddShape(shape, position, foregroundColor)} onZoom={changeZoom} />
            </div>
          </div>
          {splitView && <div className="relative flex min-w-0 items-center justify-center overflow-hidden rounded-md border border-white/[0.08] bg-black/20 p-3">
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#111113]/95 p-1 shadow-lg">
              <button type="button" aria-pressed={viewsLinked} onClick={() => setViewsLinked((value) => !value)} className={`rounded px-1.5 py-1 text-[9px] ${viewsLinked ? 'bg-violet-400/15 text-violet-200' : 'text-zinc-500 hover:text-zinc-200'}`}>{viewsLinked ? 'Linked' : 'Unlinked'}</button>
              {!viewsLinked && <><button type="button" aria-label="Secondary zoom out" onClick={() => setSecondaryZoom((value) => Math.max(25, value - 25))} className="rounded px-1 text-zinc-500 hover:text-zinc-200">−</button><span className="w-8 text-center font-mono text-[8px] text-zinc-500">{secondaryZoom}%</span><button type="button" aria-label="Secondary zoom in" onClick={() => setSecondaryZoom((value) => Math.min(400, value + 25))} className="rounded px-1 text-zinc-500 hover:text-zinc-200">+</button><button type="button" aria-label="Rotate secondary view" onClick={() => setSecondaryRotation((value) => value + 15)} className="rounded px-1 text-[10px] text-zinc-500 hover:text-zinc-200">↷</button></>}
            </div>
            <div className="transparency-grid inline-flex max-h-full max-w-full transition-transform duration-150" style={{ transform: `scale(${(viewsLinked ? zoom : secondaryZoom) / 100}) rotate(${viewsLinked ? viewRotation : secondaryRotation}deg)` }}>
              <canvas ref={secondaryCanvasRef} width={preset.width} height={preset.height} aria-label="Linked composition view" className="block h-auto w-auto max-h-[calc(100vh-230px)] max-w-full rounded-sm shadow-[0_20px_55px_rgba(0,0,0,0.45)]" />
            </div>
          </div>}
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
        {quickMask ? `Quick Mask · ${tool === 'eraser' ? 'erase to remove' : 'paint to add'} selection · press Q to exit` : toolHint}
      </div>
    </section>
  )
}
