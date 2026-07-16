import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { CanvasStage } from './components/CanvasStage'
import { downloadBlob } from './editor/download'
import { Inspector } from './components/Inspector'
import { LayersPanel } from './components/LayersPanel'
import { MenuBar } from './components/MenuBar'
import { ToolRail, type EditorTool } from './components/ToolRail'
import { historyReducer, initialHistoryState } from './editor/editor.reducer'
import { defaultLayerFilters, normalizeLayerFilters } from './editor/filters'
import { hasEnabledLayerEffects } from './editor/effects'
import { alphaBoundsInRegion, cloneRasterSource, createEmptyRasterSource, createLayerMaskSource, createRasterSurface, loadImageFile, mergeRasterBounds, surfaceToBlob } from './editor/image'
import { createAdjustmentLayer, createId, createImageLayer, createLayerGroup, createRasterLayer, createShapeLayer, createSmartObjectLayer, createTextLayer, duplicateLayer, getDocumentSize, initialDocument } from './editor/presets'
import { loadRecoveryProject, parseProjectFile, saveRecoveryProject, serializeProject, writeProjectStream } from './editor/project'
import { openBrowserWritable, writeBlobIncrementally, type BrowserWritable } from './editor/file-save'
import { calculateImageRect, getLayerBounds } from './editor/renderer'
import { canvas2dCompositionRenderer } from './editor/rendering/composition-renderer'
import { useRendererCapabilities } from './editor/rendering/use-renderer-capabilities'
import type { AssetMap, SourceImage } from './editor/runtime-assets'
import { getDescendantGroupIds, groupIsLocked, layerIsLocked } from './editor/stack'
import { smartObjectBytesHash, smartObjectDocumentHash } from './editor/smart-objects'
import { extractImageData, type RasterEdit, type RasterRegion } from './editor/raster'
import { documentRegionToSourceRegion } from './editor/raster-target'
import type { DocumentChannel, DocumentPath, EditorDispatch, EditorLayer, HistoryState, LayerFilters, LayerGeometryTransform, LayerPatch, Position, ShapeKind } from './editor/types'
import { applySelectionAlphaMask, colorRangeMask, componentChannelMask, edgeSelectionMask, featherSelection, growSelectionMask, invertSelection, luminosityRangeMask, morphSelection, selectAll, selectionAlphaAt, similarSelectionMask, type ComponentChannel, type SelectionBounds, type SelectionMode, type SelectionState } from './editor/selection'
import { useCanvasRenderer } from './editor/use-canvas-renderer'
import { importBrushes, importFont, loadBrushLibrary, loadFontLibrary, removeBrush, removeFont, roundBrush, serializeBrushPreset, type BrushPreset, type CustomFontResource } from './editor/resources'
import { Toast, type ToastMessage, type ToastTone } from './components/Toast'
import { SelectAndMaskWorkspace } from './components/SelectAndMaskWorkspace'
import { cloneSelection } from './editor/selection'
import { builtInWorkspacePresets, defaultWorkspaceLayout, normalizeWorkspaceLayout, reorderUtilityPanels, type WorkspaceLayout, type WorkspacePreset } from './editor/panel-layout'
import { normalizeCustomSwatches, normalizeHexColor } from './editor/swatches'
import { gradientStops, normalizeCustomGradients, normalizeGradientStops, type GradientPreset, type GradientStop } from './editor/gradients'
import { importPatternFile, normalizeCustomPatterns, serializePatternPreset, type PatternPreset } from './editor/patterns'
import type { AlphaChannelTransform } from './components/UtilityPanels'
import { normalizeCustomShapes, parseCustomShapeFile, serializeCustomShape, type CustomShapePreset } from './editor/shape-library'
import { perspectiveCropPixels } from './editor/transform'
import { precisionFromImageData } from './editor/precision'
import { ShortcutEditor } from './components/ShortcutEditor'
import { normalizeShortcutMap, type ShortcutMap } from './editor/shortcuts'
import { actionConditionMatches, type ActionStep } from './editor/actions'
import { ScriptSandboxDialog } from './components/ScriptSandboxDialog'
import { PluginManagerDialog } from './components/PluginManagerDialog'
import { normalizePlugins, type PluginFilterHook, type StudioPlugin } from './editor/plugins'
import { CommandPalette, type PaletteCommand } from './components/CommandPalette'
import { ContextualHelpDialog } from './components/ContextualHelpDialog'
import { createDiagnosticReport, installDiagnosticListeners } from './editor/diagnostics'
import { shortcutCommands, shortcutLabel } from './editor/shortcuts'
import { animationDocumentAt } from './editor/animation'
import { AnimationTimeline } from './components/AnimationTimeline'
import { ExportWorkspace, type AssetExportSettings } from './components/ExportWorkspace'
import { PrintDialog } from './components/PrintDialog'
import { desktopBridge, nativeFile, type DesktopNativeFile } from './editor/desktop'
import type { EditorPerformanceMetrics } from './editor/performance-metrics'

type ExportFormat = 'png' | 'jpeg' | 'webp' | 'svg' | 'psd' | 'psb' | 'tiff' | 'pdf' | 'gif' | 'apng' | 'avif'
type Alignment = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom'

type AppProps = { onExit?: () => void; initialState?: HistoryState['present']; performanceMetrics?: EditorPerformanceMetrics }
type DocumentTab = { id: string; name: string; history: HistoryState; assets: AssetMap }
type ActiveWorkerJob = { label: string; cancel: () => void }

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number | undefined, signal?: AbortSignal) {
  signal?.throwIfAborted()
  return new Promise<Blob>((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', cancel)
      callback()
    }
    const cancel = () => finish(() => reject(signal?.reason instanceof Error ? signal.reason : new DOMException('Image encoding was cancelled.', 'AbortError')))
    signal?.addEventListener('abort', cancel, { once: true })
    canvas.toBlob((blob) => finish(() => blob ? resolve(blob) : reject(new Error('The browser image encoder returned no file.'))), type, quality)
  })
}

function App({ onExit, initialState, performanceMetrics }: AppProps) {
  const [history, historyDispatch] = useReducer(historyReducer, initialState, (document) => document ? { ...structuredClone(initialHistoryState), present: structuredClone(document) } : structuredClone(initialHistoryState))
  const initialTabId = useRef<string>(createId()).current
  const [documentTabs, setDocumentTabs] = useState<DocumentTab[]>(() => [{ id: initialTabId, name: initialState ? 'Performance fixture' : 'Untitled', history: structuredClone(history), assets: {} }])
  const documentTabsRef = useRef(documentTabs)
  const [activeTabId, setActiveTabId] = useState<string>(initialTabId)
  const [layerTransferTarget, setLayerTransferTarget] = useState('')
  const [, bumpRasterHistory] = useReducer((value: number) => value + 1, 0)
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [selectionWorkspaceSource, setSelectionWorkspaceSource] = useState<SelectionState | null>(null)
  const [assets, setAssets] = useState<AssetMap>({})
  const [isLoading, setIsLoading] = useState(!initialState)
  const [isExporting, setIsExporting] = useState(false)
  const [notice, setNoticeState] = useState<ToastMessage | null>(null)
  const setNotice = useCallback((message: string | null, tone: ToastTone = 'error') => setNoticeState(message ? { message, tone } : null), [])
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [isProjectSaving, setIsProjectSaving] = useState(false)
  const [editingMaskLayerId, setEditingMaskLayerId] = useState<string | null>(null)
  const [tool, setTool] = useState<EditorTool>('move')
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(() => { try { return normalizeShortcutMap(JSON.parse(localStorage.getItem('studio.shortcuts') ?? '{}')) } catch { return normalizeShortcutMap({}) } })
  const [editingShortcuts, setEditingShortcuts] = useState(false)
  const [editingScripts, setEditingScripts] = useState(false)
  const [editingPlugins, setEditingPlugins] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [contextualHelpOpen, setContextualHelpOpen] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [exportWorkspaceOpen, setExportWorkspaceOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [animationPreview, setAnimationPreview] = useState({ frameIndex: 0, time: 0 })
  const [recoverySavedAt, setRecoverySavedAt] = useState<string>()
  const [plugins, setPlugins] = useState<StudioPlugin[]>(() => { try { return normalizePlugins(JSON.parse(localStorage.getItem('studio.plugins') ?? '[]')) } catch { return [] } })
  const [lastGeometryTransform, setLastGeometryTransform] = useState<LayerGeometryTransform | null>(null)
  const [zoom, setZoom] = useState(100)
  const [customFonts, setCustomFonts] = useState<CustomFontResource[]>([])
  const [customBrushes, setCustomBrushes] = useState<BrushPreset[]>([])
  const [brushId, setBrushId] = useState(roundBrush.id)
  const [foregroundColor, setForegroundColor] = useState(() => {
    try { return normalizeHexColor(localStorage.getItem('studio.foreground-color'), '#ff3b81') } catch { return '#ff3b81' }
  })
  const [backgroundColor, setBackgroundColor] = useState(() => {
    try { return normalizeHexColor(localStorage.getItem('studio.background-color'), '#5b21b6') } catch { return '#5b21b6' }
  })
  const [customSwatches, setCustomSwatches] = useState<string[]>(() => {
    try { return normalizeCustomSwatches(JSON.parse(localStorage.getItem('studio.custom-swatches') ?? '[]')) } catch { return [] }
  })
  const [customGradients, setCustomGradients] = useState<GradientPreset[]>(() => {
    try { return normalizeCustomGradients(JSON.parse(localStorage.getItem('studio.custom-gradients') ?? '[]')) } catch { return [] }
  })
  const [activeGradientStops, setActiveGradientStops] = useState<GradientStop[]>(() => gradientStops([foregroundColor, backgroundColor]))
  const [customPatterns, setCustomPatterns] = useState<PatternPreset[]>(() => {
    try { return normalizeCustomPatterns(JSON.parse(localStorage.getItem('studio.custom-patterns') ?? '[]')) } catch { return [] }
  })
  const [customShapes, setCustomShapes] = useState<CustomShapePreset[]>(() => {
    try { return normalizeCustomShapes(JSON.parse(localStorage.getItem('studio.custom-shapes') ?? '[]')) } catch { return [] }
  })
  const [resourceRevision, bumpResourceRevision] = useReducer((value: number) => value + 1, 0)
  const [workspaceLayout, setWorkspaceLayout] = useState<WorkspaceLayout>(() => {
    try {
      const saved = localStorage.getItem('studio.workspace-layout')
      if (saved) return normalizeWorkspaceLayout(JSON.parse(saved))
      const legacyWidths = JSON.parse(localStorage.getItem('studio.panel-widths') ?? '{}') as { properties?: number; layers?: number }
      return normalizeWorkspaceLayout({
        propertiesOnLeft: localStorage.getItem('studio.panel-layout') !== 'layers-left',
        panelWidths: legacyWidths,
      })
    } catch {
      return normalizeWorkspaceLayout(defaultWorkspaceLayout)
    }
  })
  const [smartObjectSessions, setSmartObjectSessions] = useState<Array<{ parentHistory: HistoryState; layerId: string; assetId: string; name: string }>>([])
  const [savedWorkspaces, setSavedWorkspaces] = useState<WorkspacePreset[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('studio.saved-workspaces') ?? '[]') as unknown
      if (!Array.isArray(saved)) return []
      return saved.flatMap((value) => {
        if (!value || typeof value !== 'object') return []
        const candidate = value as Partial<WorkspacePreset>
        const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 48) : ''
        return name ? [{ name, layout: normalizeWorkspaceLayout(candidate.layout) }] : []
      })
    } catch {
      return []
    }
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const linkedSmartObjectInputRef = useRef<HTMLInputElement>(null)
  const replaceSmartObjectInputRef = useRef<HTMLInputElement>(null)
  const relinkSmartObjectInputRef = useRef<HTMLInputElement>(null)
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const fontInputRef = useRef<HTMLInputElement>(null)
  const brushInputRef = useRef<HTMLInputElement>(null)
  const shapeInputRef = useRef<HTMLInputElement>(null)
  const patternInputRef = useRef<HTMLInputElement>(null)
  const profileInputRef = useRef<HTMLInputElement>(null)
  const profileActionRef = useRef<'assign' | 'convert' | 'proof'>('assign')
  const hydratedRef = useRef(Boolean(initialState))
  const rasterUndoRef = useRef<Array<RasterEdit & { depth: number }>>([])
  const rasterRedoRef = useRef<Array<RasterEdit & { depth: number }>>([])
  const assetsRef = useRef(assets)
  const precisionBackupsRef = useRef(new Map<string, Map<16 | 32, NonNullable<SourceImage['precision']>>>())
  const desktopOpenRef = useRef<(file: DesktopNativeFile) => void>(() => {})
  const desktopCommandRef = useRef<(command: string) => void>(() => {})
  const desktopDropRef = useRef<(file: File) => void>(() => {})
  const scratchRevisionRef = useRef('')
  const activeWorkerJobRef = useRef<ActiveWorkerJob | null>(null)
  const document = history.present
  const rendererCapabilities = useRendererCapabilities(document)
  const renderDocument = animationDocumentAt(document, animationPreview)

  useEffect(() => {
    installDiagnosticListeners()
    const keyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen(true)
      } else if (event.key === 'F1') {
        event.preventDefault()
        setContextualHelpOpen(true)
      } else if (event.key === 'Escape' && activeWorkerJobRef.current) {
        event.preventDefault()
        event.stopImmediatePropagation()
        const job = activeWorkerJobRef.current
        job.cancel()
        setNotice(`${job.label} cancelled. The document was not changed.`, 'info')
      }
    }
    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  }, [setNotice])

  const runWorkerTask = <T,>(label: string, worker: Worker, message: unknown, transfer: Transferable[], signal?: AbortSignal) => new Promise<T>((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', cancel)
      worker.terminate()
      callback()
    }
    const cancel = () => finish(() => reject(signal?.reason instanceof Error ? signal.reason : new DOMException(`${label} was cancelled.`, 'AbortError')))
    worker.onmessage = (event) => finish(() => resolve(event.data as T))
    worker.onerror = () => finish(() => reject(new Error(`The ${label.toLocaleLowerCase()} worker stopped unexpectedly.`)))
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      worker.postMessage(message, transfer)
    } catch (error) {
      finish(() => reject(error))
    }
  })

  const runCancelableJob = async <T,>(label: string, task: (signal: AbortSignal) => Promise<T>) => {
    const controller = new AbortController()
    const job: ActiveWorkerJob = { label, cancel: () => controller.abort() }
    activeWorkerJobRef.current?.cancel()
    activeWorkerJobRef.current = job
    try {
      return await task(controller.signal)
    } finally {
      if (activeWorkerJobRef.current === job) activeWorkerJobRef.current = null
    }
  }

  const runWorkerJob = <T,>(label: string, worker: Worker, message: unknown, transfer: Transferable[]) => runCancelableJob(label, (signal) => runWorkerTask<T>(label, worker, message, transfer, signal))

  useEffect(() => {
    const desktop = desktopBridge()
    if (!desktop) return
    const unsubscribeOpen = desktop.onOpenFile((file) => desktopOpenRef.current(file))
    const unsubscribeCommand = desktop.onCommand((command) => desktopCommandRef.current(command))
    const unsubscribeChange = desktop.onExternalChange((change) => setNotice(`The source file changed outside Studio at ${new Date(change.at).toLocaleTimeString()}. Reopen it to load the external version.`, 'warning'))
    const desktopError = (event: Event) => setNotice((event as CustomEvent<string>).detail, 'error')
    const dragOver = (event: DragEvent) => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault() }
    const drop = (event: DragEvent) => {
      if (event.defaultPrevented) return
      const file = event.dataTransfer?.files[0]
      if (file) { event.preventDefault(); desktopDropRef.current(file) }
    }
    window.addEventListener('studio:desktop-error', desktopError)
    window.addEventListener('dragover', dragOver)
    window.addEventListener('drop', drop)
    return () => { unsubscribeOpen(); unsubscribeCommand(); unsubscribeChange(); window.removeEventListener('studio:desktop-error', desktopError); window.removeEventListener('dragover', dragOver); window.removeEventListener('drop', drop) }
  }, [setNotice])

  assetsRef.current = assets
  documentTabsRef.current = documentTabs
  useCanvasRenderer(canvasRef, renderDocument, assets, resourceRevision, rendererCapabilities.activeRenderer, performanceMetrics)

  useEffect(() => {
    if (!performanceMetrics) return
    const pointer = (event: PointerEvent) => performanceMetrics.recordPointer(event.timeStamp)
    let frame = 0
    const recordFrame = (timestamp: number) => {
      performanceMetrics.recordFrame(timestamp)
      frame = window.requestAnimationFrame(recordFrame)
    }
    const memory = window.setInterval(() => {
      const runtime = performance as Performance & { memory?: { usedJSHeapSize?: number } }
      performanceMetrics.recordMemory(runtime.memory?.usedJSHeapSize)
    }, 250)
    window.addEventListener('pointermove', pointer, true)
    frame = window.requestAnimationFrame(recordFrame)
    return () => {
      window.removeEventListener('pointermove', pointer, true)
      window.cancelAnimationFrame(frame)
      window.clearInterval(memory)
    }
  }, [performanceMetrics])

  const saveMetricStopRef = useRef<(() => void) | null>(null)
  const exportMetricStopRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (isProjectSaving && !saveMetricStopRef.current) saveMetricStopRef.current = performanceMetrics?.start('save') ?? null
    else if (!isProjectSaving && saveMetricStopRef.current) { saveMetricStopRef.current(); saveMetricStopRef.current = null }
  }, [isProjectSaving, performanceMetrics])
  useEffect(() => {
    if (isExporting && !exportMetricStopRef.current) exportMetricStopRef.current = performanceMetrics?.start('export') ?? null
    else if (!isExporting && exportMetricStopRef.current) { exportMetricStopRef.current(); exportMetricStopRef.current = null }
  }, [isExporting, performanceMetrics])

  useEffect(() => {
    if (document.bitDepth === 8) return
    const bitDepth = document.bitDepth
    setAssets((current) => {
      let changed = false
      const next = Object.fromEntries(Object.entries(current).map(([id, asset]) => {
        const backups = precisionBackupsRef.current.get(id) ?? new Map<16 | 32, NonNullable<SourceImage['precision']>>()
        precisionBackupsRef.current.set(id, backups)
        if (asset.precision) backups.set(asset.precision.bitDepth, asset.precision)
        if (asset.precision?.bitDepth === bitDepth && asset.precision.revision === (asset.revision ?? 0)) return [id, asset]
        const restored = backups.get(bitDepth)
        if (restored?.revision === (asset.revision ?? 0)) { changed = true; return [id, { ...asset, precision: restored }] }
        const surface = asset.surface
        const context = surface?.getContext('2d', { willReadFrequently: true })
        if (!surface || !context) return [id, asset]
        const precision = precisionFromImageData(context.getImageData(0, 0, surface.width, surface.height), bitDepth, asset.revision ?? 0)
        backups.set(bitDepth, precision)
        changed = true
        return [id, { ...asset, precision }]
      }))
      return changed ? next : current
    })
  }, [document.bitDepth])

  useEffect(() => {
    setDocumentTabs((current) => current.map((tab) => tab.id === activeTabId ? { ...tab, history, assets } : tab))
  }, [activeTabId, assets, history])

  useEffect(() => {
    const firstOther = documentTabs.find((tab) => tab.id !== activeTabId)?.id ?? ''
    if (!documentTabs.some((tab) => tab.id === layerTransferTarget && tab.id !== activeTabId)) setLayerTransferTarget(firstOther)
  }, [activeTabId, documentTabs, layerTransferTarget])

  useEffect(() => {
    try { localStorage.setItem('studio.workspace-layout', JSON.stringify(workspaceLayout)) } catch { /* local storage is optional */ }
  }, [workspaceLayout])

  useEffect(() => {
    try { localStorage.setItem('studio.saved-workspaces', JSON.stringify(savedWorkspaces)) } catch { /* local storage is optional */ }
  }, [savedWorkspaces])
  useEffect(() => {
    try { localStorage.setItem('studio.shortcuts', JSON.stringify(shortcuts)) } catch { /* Shortcut customization is optional. */ }
  }, [shortcuts])
  useEffect(() => {
    try { localStorage.setItem('studio.plugins', JSON.stringify(plugins)) } catch { /* Plugin manifests are optional. */ }
  }, [plugins])

  useEffect(() => {
    try {
      localStorage.setItem('studio.foreground-color', foregroundColor)
      localStorage.setItem('studio.background-color', backgroundColor)
      localStorage.setItem('studio.custom-swatches', JSON.stringify(customSwatches))
      localStorage.setItem('studio.custom-gradients', JSON.stringify(customGradients))
      localStorage.setItem('studio.custom-patterns', JSON.stringify(customPatterns))
      localStorage.setItem('studio.custom-shapes', JSON.stringify(customShapes))
    } catch { /* local storage is optional */ }
  }, [backgroundColor, customGradients, customPatterns, customShapes, customSwatches, foregroundColor])

  useEffect(() => {
    if (!notice) return
    const duration = notice.tone === 'warning' ? 12000 : notice.tone === 'error' ? 8000 : 5000
    const timer = window.setTimeout(() => setNoticeState(null), duration)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (initialState) return
    let cancelled = false
    Promise.all([loadFontLibrary(), loadBrushLibrary()]).then(([fonts, brushes]) => {
      if (cancelled) return
      setCustomFonts(fonts)
      setCustomBrushes(brushes)
      bumpResourceRevision()
    }).catch(() => {
      if (!cancelled) setNotice('The local font and brush library could not be restored.')
    })
    return () => { cancelled = true }
  }, [initialState, setNotice])

  const loadFontFile = useCallback(async (file: File) => {
    try {
      const font = await importFont(file)
      setCustomFonts((current) => [...current.filter((candidate) => candidate.id !== font.id), font])
      bumpResourceRevision()
      setNotice(`Loaded ${font.name}. Select it from a text layer’s font menu.`, 'success')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That font could not be loaded.')
    }
  }, [setNotice])

  const loadBrushFile = useCallback(async (file: File) => {
    try {
      const imported = await importBrushes(file)
      setCustomBrushes((current) => [...current.filter((candidate) => !imported.some((brush) => brush.id === candidate.id)), ...imported])
      const brush = imported.at(-1)!
      setBrushId(brush.id)
      setTool('brush')
      setNotice(imported.length === 1 ? `Loaded ${brush.name} and selected it for painting.` : `Loaded ${imported.length} brushes from ${file.name}.`, 'success')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That brush could not be loaded.')
    }
  }, [setNotice])

  const exportBrushFromLibrary = useCallback(async (brush: BrushPreset) => {
    try {
      downloadBlob(await serializeBrushPreset(brush), `${brush.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'brush'}.studio-brush`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The brush preset could not be exported.')
    }
  }, [setNotice])

  const exportPatternFromLibrary = useCallback((pattern: PatternPreset) => {
    downloadBlob(serializePatternPreset(pattern), `${pattern.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'pattern'}.studio-pattern`)
  }, [])

  const removeBrushFromLibrary = useCallback(async (id: string) => {
    try {
      await removeBrush(id)
      setCustomBrushes((current) => current.filter((brush) => brush.id !== id))
      setBrushId((current) => current === id ? roundBrush.id : current)
      setNotice('Removed the brush from this browser.', 'success')
    } catch {
      setNotice('The brush could not be removed from the local library.')
    }
  }, [setNotice])

  const removeFontFromLibrary = useCallback(async (id: string) => {
    try {
      await removeFont(id)
      setCustomFonts((current) => current.filter((font) => font.id !== id))
      bumpResourceRevision()
      setNotice('Removed the font from this browser.', 'success')
    } catch {
      setNotice('The font could not be removed from the local library.')
    }
  }, [setNotice])

  const dispatch = useCallback<EditorDispatch>((action, options) => {
    if (rasterRedoRef.current.length) {
      rasterRedoRef.current = []
      bumpRasterHistory()
    }
    if (action.type === 'reset-document') setSelection(null)
    if (action.type === 'update-layer' && action.patch.geometryTransform) setLastGeometryTransform(structuredClone(action.patch.geometryTransform))
    historyDispatch({ type: 'apply', action, record: options?.record, groupKey: options?.groupKey })
  }, [])
  const endHistoryGroup = useCallback(() => historyDispatch({ type: 'end-group' }), [])

  const loadPatternFile = useCallback(async (file: File) => {
    try {
      const pattern = await importPatternFile(file)
      setCustomPatterns((current) => normalizeCustomPatterns([...current.filter((candidate) => candidate.id !== pattern.id), pattern]))
      dispatch({ type: 'set-pattern', patch: { kind: pattern.kind, color: pattern.color, opacity: pattern.opacity, size: pattern.size, bitmap: pattern.bitmap } })
      setNotice(`Loaded ${pattern.name} into the local pattern library.`, 'success')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That pattern could not be loaded.')
    }
  }, [dispatch, setNotice])

  const addImageFile = useCallback(async (file: File) => {
    setIsLoading(true)
    setNotice(null)
    try {
      const source = await loadImageFile(file)
      const assetId = createId()
      setAssets((current) => ({ ...current, [assetId]: source }))
      dispatch({ type: 'add-layer', layer: createImageLayer(assetId, file.name.replace(/\.[^.]+$/, '')) })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That image could not be loaded.')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, setNotice])

  const addLinkedSmartObjectFile = useCallback(async (file: File) => {
    setIsLoading(true)
    setNotice(null)
    try {
      const source = await loadImageFile(file)
      const assetId = createId()
      const width = source.element.naturalWidth || source.surface?.width || 1
      const height = source.element.naturalHeight || source.surface?.height || 1
      const layer = createSmartObjectLayer(assetId, file.name.replace(/\.[^.]+$/, ''), width, height, {
        kind: 'linked',
        fileName: file.name,
        mimeType: file.type || undefined,
        lastModified: file.lastModified,
      })
      layer.contentHash = smartObjectBytesHash(new Uint8Array(await file.arrayBuffer()))
      setAssets((current) => ({ ...current, [assetId]: source }))
      dispatch({ type: 'add-layer', layer })
      setNotice(`Placed ${file.name} as a linked smart object. Use Relink to refresh its local snapshot.`, 'success')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That smart-object source could not be loaded.')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, setNotice])

  const setBackgroundFile = useCallback(async (file: File) => {
    setIsLoading(true)
    setNotice(null)
    try {
      const source = await loadImageFile(file)
      const assetId = createId()
      setAssets((current) => ({ ...current, [assetId]: source }))
      dispatch({ type: 'set-background', patch: { kind: 'image', imageAssetId: assetId } })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That background could not be loaded.')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, setNotice])

  useEffect(() => {
    let cancelled = false
    const hydrate = async () => {
      try {
        const recovery = await loadRecoveryProject()
        if (cancelled) return
        if (recovery) {
          setAssets(recovery.assets)
          historyDispatch({ type: 'replace', document: recovery.document })
          setRecoverySavedAt(recovery.savedAt)
          const saved = recovery.savedAt ? new Date(recovery.savedAt).toLocaleString() : 'the latest snapshot'
          setNotice(`Recovered your locally autosaved project from ${saved}.`, 'info')
        }
      } catch {
        if (!cancelled) setNotice('Local recovery was unavailable, so a fresh document was opened.', 'warning')
      } finally {
        if (!cancelled) {
          hydratedRef.current = true
          setIsLoading(false)
        }
      }
    }
    void hydrate()
    return () => { cancelled = true }
  }, [setNotice])

  useEffect(() => {
    if (initialState || !hydratedRef.current || isLoading) return
    setSaveStatus('saving')
    const timer = window.setTimeout(() => {
      saveRecoveryProject(document, assets)
        .then(() => { setSaveStatus('saved'); setRecoverySavedAt(new Date().toISOString()) })
        .catch(() => setSaveStatus('idle'))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [assets, document, initialState, isLoading])

  useEffect(() => {
    const desktop = desktopBridge()
    const bytes = Object.values(assets).reduce((total, asset) => total + (asset.blob?.size ?? (asset.surface ? asset.surface.width * asset.surface.height * 4 : 0)) + (asset.precision?.data.byteLength ?? 0), 0)
    if (!desktop || bytes < 128 * 1024 ** 2 || isLoading) return
    const revision = `${activeTabId}:${document.layers.length}:${Object.values(assets).reduce((total, asset) => total + (asset.revision ?? 0), 0)}`
    if (scratchRevisionRef.current === revision) return
    const timer = window.setTimeout(() => {
      void serializeProject(document, assets).then((project) => desktop.writeScratch(activeTabId, new TextEncoder().encode(project).buffer)).then(() => { scratchRevisionRef.current = revision }).catch((error) => setNotice(error instanceof Error ? error.message : 'Desktop scratch storage could not be updated.', 'warning'))
    }, 5_000)
    return () => window.clearTimeout(timer)
  }, [activeTabId, assets, document, isLoading, setNotice])

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith('image/'))
      const file = imageItem?.getAsFile()
      if (file) void addImageFile(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addImageFile])

  const selectedLayers = document.layers.filter((layer) => document.selectedLayerIds.includes(layer.id))
  const selectedGroup = document.groups.find((group) => group.id === document.selectedGroupId)

  useEffect(() => {
    if (!editingMaskLayerId) return
    const layer = document.layers.find((candidate) => candidate.id === editingMaskLayerId)
    if (!layer?.maskAssetId || document.selectedLayerId !== editingMaskLayerId) setEditingMaskLayerId(null)
  }, [document.layers, document.selectedLayerId, editingMaskLayerId])

  const refreshRasterAsset = useCallback((assetId: string, region?: RasterRegion) => {
    setAssets((current) => {
      const asset = current[assetId]
      if (!asset) return current
      const revision = (asset.revision ?? 0) + 1
      const dirtyRegions = region
        ? [...(asset.dirtyRegions ?? []), { revision, region }].slice(-64)
        : asset.dirtyRegions
      const changedBounds = region && asset.surface ? alphaBoundsInRegion(asset.surface, region) : null
      const coversCurrentBounds = Boolean(region && asset.contentBounds
        && region.x <= asset.contentBounds.x && region.y <= asset.contentBounds.y
        && region.x + region.width >= asset.contentBounds.x + asset.contentBounds.width
        && region.y + region.height >= asset.contentBounds.y + asset.contentBounds.height)
      const contentBounds = asset.contentBounds === undefined
        ? undefined
        : coversCurrentBounds ? changedBounds : mergeRasterBounds(asset.contentBounds, changedBounds)
      return { ...current, [assetId]: { ...asset, revision, dirtyRegions, contentBounds } }
    })
  }, [])

  const applyRasterEdit = useCallback((edit: RasterEdit, side: 'before' | 'after') => {
    const asset = assetsRef.current[edit.assetId]
    const context = asset?.surface?.getContext('2d', { willReadFrequently: true })
    if (!asset?.surface || !context) return
    context.putImageData(edit[side], edit.x, edit.y)
    refreshRasterAsset(edit.assetId, { x: edit.x, y: edit.y, width: edit[side].width, height: edit[side].height })
    void surfaceToBlob(asset.surface).then((blob) => setAssets((current) => current[edit.assetId] ? { ...current, [edit.assetId]: { ...current[edit.assetId], blob } } : current))
  }, [refreshRasterAsset])

  const performUndo = useCallback(() => {
    const raster = rasterUndoRef.current.at(-1)
    if (raster && raster.depth === history.past.length) {
      rasterUndoRef.current.pop()
      rasterRedoRef.current.push(raster)
      applyRasterEdit(raster, 'before')
      bumpRasterHistory()
    } else historyDispatch({ type: 'undo' })
  }, [applyRasterEdit, history.past.length])

  const performRedo = useCallback(() => {
    const raster = rasterRedoRef.current.at(-1)
    if (raster && raster.depth === history.past.length) {
      rasterRedoRef.current.pop()
      rasterUndoRef.current.push(raster)
      applyRasterEdit(raster, 'after')
      bumpRasterHistory()
    } else historyDispatch({ type: 'redo' })
  }, [applyRasterEdit, history.past.length])

  const jumpDocumentHistory = useCallback((targetIndex: number) => {
    const distance = targetIndex - history.past.length
    const action = distance < 0 ? 'undo' : 'redo'
    for (let step = 0; step < Math.abs(distance); step += 1) historyDispatch({ type: action })
  }, [history.past.length])

  const commitRasterEdit = useCallback((edit: RasterEdit) => {
    rasterUndoRef.current.push({ ...edit, depth: history.past.length })
    rasterUndoRef.current = rasterUndoRef.current.slice(-40)
    rasterRedoRef.current = []
    bumpRasterHistory()
    historyDispatch({ type: 'discard-future' })
    const surface = assetsRef.current[edit.assetId]?.surface
    if (surface) void surfaceToBlob(surface).then((blob) => setAssets((current) => current[edit.assetId] ? { ...current, [edit.assetId]: { ...current[edit.assetId], blob } } : current))
  }, [history.past.length])

  const duplicateSelection = useCallback(() => {
    if (selectedLayers.length === 0) return
    const groupCopies = new Map<string, string>()
    const sourceGroups = selectedGroup
      ? [selectedGroup, ...document.groups.filter((group) => getDescendantGroupIds(document, selectedGroup.id).has(group.id))]
      : []
    for (const group of sourceGroups) groupCopies.set(group.id, createId())
    const duplicatedGroupId = selectedGroup ? groupCopies.get(selectedGroup.id) ?? null : null
    for (const group of sourceGroups) {
      dispatch({
        type: 'add-group',
        group: {
          ...group,
          id: groupCopies.get(group.id)!,
          name: group.id === selectedGroup?.id ? `${group.name} copy` : group.name,
          parentId: group.id === selectedGroup?.id ? group.parentId ?? null : groupCopies.get(group.parentId ?? '') ?? null,
          stackOrder: undefined,
        },
        layerIds: [],
      }, { groupKey: 'duplicate-selection' })
    }
    const copiedAssets: AssetMap = {}
    for (const layer of selectedLayers) {
      const copy = duplicateLayer(layer)
      if (duplicatedGroupId) copy.groupId = groupCopies.get(layer.groupId ?? '') ?? duplicatedGroupId
      if (layer.type === 'raster' && copy.type === 'raster') {
        const source = assetsRef.current[layer.assetId]
        if (source) {
          const assetId = createId()
          copiedAssets[assetId] = cloneRasterSource(source, copy.name)
          copy.assetId = assetId
        }
      }
      if (layer.maskAssetId) {
        const mask = assetsRef.current[layer.maskAssetId]
        if (mask) {
          const maskAssetId = createId()
          copiedAssets[maskAssetId] = cloneRasterSource(mask, `${copy.name} mask`)
          copy.maskAssetId = maskAssetId
        }
      }
      dispatch({ type: 'add-layer', layer: copy }, { groupKey: 'duplicate-selection' })
    }
    if (Object.keys(copiedAssets).length) setAssets((current) => ({ ...current, ...copiedAssets }))
    if (duplicatedGroupId) dispatch({ type: 'select-group', id: duplicatedGroupId }, { record: false })
    endHistoryGroup()
  }, [dispatch, document, endHistoryGroup, selectedGroup, selectedLayers])

  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const element = target as HTMLElement | null
      return element?.matches('input, textarea, select, [contenteditable="true"]') ?? false
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return
      const command = event.metaKey || event.ctrlKey
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) performRedo()
        else performUndo()
        return
      }
      if (command && event.key.toLowerCase() === 'j' && selectedLayers.length > 0) {
        event.preventDefault()
        duplicateSelection()
        return
      }
      if (event.key === 'Escape') {
        dispatch({ type: 'select-layer', id: null }, { record: false })
        return
      }
      if ((event.key === 'Backspace' || event.key === 'Delete') && selectedGroup && !groupIsLocked(document, selectedGroup)) {
        event.preventDefault()
        dispatch({ type: 'remove-group', id: selectedGroup.id, deleteLayers: true })
        return
      }
      if ((event.key === 'Backspace' || event.key === 'Delete') && selectedLayers.some((layer) => !layer.locked)) {
        event.preventDefault()
        dispatch({ type: 'remove-layers', ids: selectedLayers.filter((layer) => !layer.locked).map((layer) => layer.id) })
        return
      }
      if (selectedLayers.some((layer) => !layerIsLocked(document, layer)) && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault()
        const step = event.shiftKey ? 0.02 : 0.005
        const delta = {
          x: event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
          y: event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0,
        }
        dispatch({ type: 'update-layers', changes: selectedLayers.filter((layer) => !layerIsLocked(document, layer)).map((layer) => ({ id: layer.id, patch: { position: { x: layer.position.x + delta.x, y: layer.position.y + delta.y } } })) }, { groupKey: 'nudge-selection' })
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key.startsWith('Arrow')) endHistoryGroup()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [dispatch, document, duplicateSelection, endHistoryGroup, performRedo, performUndo, selectedGroup, selectedLayers])

  useEffect(() => () => {
    const allAssets = documentTabsRef.current.flatMap((tab) => Object.values(tab.assets)).concat(Object.values(assetsRef.current))
    for (const asset of new Set(allAssets)) {
      if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl)
    }
  }, [])

  const addEmptyLayer = () => {
    const size = getDocumentSize(document)
    const assetId = createId()
    const name = `Layer ${document.layers.filter((layer) => layer.type === 'raster').length + 1}`
    const source = createEmptyRasterSource(size.width, size.height, name)
    setAssets((current) => ({ ...current, [assetId]: source }))
    dispatch({ type: 'add-layer', layer: createRasterLayer(assetId, name, size.width, size.height) })
  }

  const addAdjustment = () => {
    dispatch({ type: 'add-layer', layer: createAdjustmentLayer(document.layers.filter((layer) => layer.type === 'adjustment').length) })
  }

  const addTextAt = (position: Position, color: string, paragraphBox?: { width: number; height: number }) => {
    const layer = createTextLayer(document.layers.filter((candidate) => candidate.type === 'text').length + 1)
    layer.position = position
    layer.color = color
    layer.paragraphBox = paragraphBox
    dispatch({ type: 'add-layer', layer })
  }

  const addShapeAt = (shape: ShapeKind, position: Position, fill: string) => {
    const layer = createShapeLayer(shape, document.layers.filter((candidate) => candidate.type === 'shape' && candidate.shape === shape).length + 1)
    layer.position = position
    layer.fill = fill
    dispatch({ type: 'add-layer', layer })
  }

  const addLayerGroup = () => {
    const group = createLayerGroup(document.groups.length)
    if (selectedGroup) group.parentId = selectedGroup.id
    dispatch({ type: 'add-group', group, layerIds: selectedGroup ? [] : document.selectedLayerIds })
  }

  const addLayerMask = (layerId: string) => {
    const layer = document.layers.find((candidate) => candidate.id === layerId)
    if (!layer || layer.type === 'adjustment' || layer.maskAssetId) return
    const size = getDocumentSize(document)
    const assetId = createId()
    const source = createLayerMaskSource(size.width, size.height, `${layer.name} mask`)
    setAssets((current) => ({ ...current, [assetId]: source }))
    dispatch({ type: 'update-layer', id: layerId, patch: { maskAssetId: assetId } })
    setEditingMaskLayerId(layerId)
  }

  const editLayerMask = (layerId: string) => {
    const layer = document.layers.find((candidate) => candidate.id === layerId)
    if (!layer?.maskAssetId) return
    if (editingMaskLayerId === layerId) setEditingMaskLayerId(null)
    else {
      dispatch({ type: 'select-layer', id: layerId }, { record: false })
      setEditingMaskLayerId(layerId)
    }
  }

  const removeLayerMask = (layerId: string) => {
    dispatch({ type: 'update-layer', id: layerId, patch: { maskAssetId: null } })
    if (editingMaskLayerId === layerId) setEditingMaskLayerId(null)
  }

  const alignSelection = (alignment: Alignment) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || selectedLayers.length < 2) return
    const entries = selectedLayers.filter((layer) => !layerIsLocked(document, layer)).flatMap((layer) => {
      const bounds = getLayerBounds(context, canvas, layer, assets)
      return bounds ? [{ layer, bounds }] : []
    })
    if (entries.length < 2) return
    const left = Math.min(...entries.map(({ bounds }) => bounds.x))
    const right = Math.max(...entries.map(({ bounds }) => bounds.x + bounds.width))
    const top = Math.min(...entries.map(({ bounds }) => bounds.y))
    const bottom = Math.max(...entries.map(({ bounds }) => bounds.y + bounds.height))
    dispatch({
      type: 'update-layers',
      changes: entries.map(({ layer, bounds }) => {
        const dx = alignment === 'left' ? left - bounds.x : alignment === 'right' ? right - bounds.x - bounds.width : alignment === 'center-x' ? (left + right) / 2 - bounds.x - bounds.width / 2 : 0
        const dy = alignment === 'top' ? top - bounds.y : alignment === 'bottom' ? bottom - bounds.y - bounds.height : alignment === 'center-y' ? (top + bottom) / 2 - bounds.y - bounds.height / 2 : 0
        return { id: layer.id, patch: { position: { x: layer.position.x + dx / canvas.width, y: layer.position.y + dy / canvas.height } } }
      }),
    })
  }

  const cropDocument = (requested: SelectionBounds) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const left = Math.max(0, Math.floor(requested.x))
    const top = Math.max(0, Math.floor(requested.y))
    const right = Math.min(canvas.width, Math.ceil(requested.x + requested.width))
    const bottom = Math.min(canvas.height, Math.ceil(requested.y + requested.height))
    const width = right - left
    const height = bottom - top
    if (width < 2 || height < 2 || (width === canvas.width && height === canvas.height)) return

    const nextAssets: AssetMap = {}
    const changes = document.layers.map((layer) => {
      const bounds = getLayerBounds(context, canvas, layer, assets)
      const patch: LayerPatch = {}
      if (bounds) {
        patch.position = {
          x: (bounds.x + bounds.width / 2 - left - width / 2) / width,
          y: (bounds.y + bounds.height / 2 - top - height / 2) / height,
        }
        if (layer.type === 'shape') {
          patch.width = bounds.width / width * 100
          patch.height = bounds.height / height * 100
        } else if (layer.type === 'image') {
          const asset = assets[layer.assetId]
          const imageWidth = asset?.element.naturalWidth || asset?.surface?.width || 1
          const imageHeight = asset?.element.naturalHeight || asset?.surface?.height || 1
          const base = calculateImageRect(width, height, imageWidth, imageHeight, { ...layer, position: { x: 0, y: 0 }, scale: 100 })
          patch.scale = bounds.width / Math.max(1, base.width) * 100
        }
      }
      if (layer.maskAssetId) {
        const oldMask = assets[layer.maskAssetId]
        const oldSurface = oldMask?.surface
        if (oldSurface) {
          const maskAssetId = createId()
          const cropped = createEmptyRasterSource(width, height, oldMask.name)
          const croppedContext = cropped.surface?.getContext('2d', { willReadFrequently: true })
          if (croppedContext) {
            croppedContext.drawImage(oldSurface, left / canvas.width * oldSurface.width, top / canvas.height * oldSurface.height, width / canvas.width * oldSurface.width, height / canvas.height * oldSurface.height, 0, 0, width, height)
            cropped.contentBounds = undefined
            nextAssets[maskAssetId] = cropped
            patch.maskAssetId = maskAssetId
          }
        }
      }
      return { id: layer.id, patch }
    })

    if (Object.keys(nextAssets).length) setAssets((current) => ({ ...current, ...nextAssets }))
    dispatch({ type: 'set-canvas-size', width, height }, { groupKey: 'crop-document' })
    dispatch({ type: 'update-layers', changes }, { groupKey: 'crop-document' })
    endHistoryGroup()
    setSelection(null)
  }

  const perspectiveCropDocument = (quad: [Position, Position, Position, Position]) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d', { willReadFrequently: true })
    if (!canvas || !context) return
    const distance = (left: Position, right: Position) => Math.hypot(right.x - left.x, right.y - left.y)
    const width = Math.max(2, Math.round((distance(quad[0], quad[1]) + distance(quad[3], quad[2])) / 2))
    const height = Math.max(2, Math.round((distance(quad[0], quad[3]) + distance(quad[1], quad[2])) / 2))
    const pixels = perspectiveCropPixels(context.getImageData(0, 0, canvas.width, canvas.height), quad, width, height)
    const assetId = createId()
    const source = createEmptyRasterSource(width, height, 'Perspective crop pixels')
    source.surface?.getContext('2d')?.putImageData(pixels, 0, 0)
    source.contentBounds = undefined
    const layer = createRasterLayer(assetId, 'Perspective Crop', width, height)
    setAssets((current) => ({ ...current, [assetId]: source }))
    dispatch({ type: 'replace-document', document: { ...document, canvasPreset: 'custom', canvasSize: { width, height }, background: { ...document.background, kind: 'transparent' }, groups: [], layers: [layer], selectedLayerId: layer.id, selectedLayerIds: [layer.id], selectedGroupId: null, channels: [], paths: [], selectedPathId: null } })
    setSelection(null)
    setNotice(`Rectified the perspective crop to ${width} × ${height}px.`, 'success')
  }

  const contentAwareScaleLayer = async (layerId: string, requestedWidth: number, requestedHeight: number) => {
    const layer = document.layers.find((candidate): candidate is Extract<EditorLayer, { type: 'raster' }> => candidate.id === layerId && candidate.type === 'raster')
    const surface = layer ? assets[layer.assetId]?.surface : null
    const context = surface?.getContext('2d', { willReadFrequently: true })
    if (!layer || !surface || !context) return
    const targetWidth = Math.max(2, Math.min(4096, Math.round(requestedWidth)))
    const targetHeight = Math.max(2, Math.min(4096, Math.round(requestedHeight)))
    setIsLoading(true)
    setNotice('Content-aware scale is running locally…', 'info')
    try {
      const input = context.getImageData(0, 0, surface.width, surface.height)
      const worker = new Worker(new URL('./editor/workers/seam-carving.worker.ts', import.meta.url), { type: 'module' })
      const output = await runWorkerJob<{ data: ArrayBuffer; width: number; height: number }>(
        'Content-aware scale',
        worker,
        { data: input.data.buffer, width: input.width, height: input.height, targetWidth, targetHeight },
        [input.data.buffer],
      )
      const assetId = createId()
      const source = createEmptyRasterSource(output.width, output.height, `${layer.name} content-aware pixels`)
      source.surface?.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(output.data), output.width, output.height), 0, 0)
      source.contentBounds = undefined
      setAssets((current) => ({ ...current, [assetId]: source }))
      dispatch({ type: 'update-layer', id: layer.id, patch: { assetId, width: output.width, height: output.height, scale: 100 } })
      setNotice(`Content-aware scaled ${layer.name} to ${output.width} × ${output.height}px.`, 'success')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice(error instanceof Error ? error.message : 'Content-aware scale could not finish.')
    } finally {
      setIsLoading(false)
    }
  }

  const contentAwareFillSelection = async () => {
    const layer = document.layers.find((candidate): candidate is Extract<EditorLayer, { type: 'raster' }> => candidate.id === document.selectedLayerId && candidate.type === 'raster')
    const surface = layer ? assets[layer.assetId]?.surface : null
    const surfaceContext = surface?.getContext('2d', { willReadFrequently: true })
    const canvas = canvasRef.current
    const canvasContext = canvas?.getContext('2d')
    const selectionContext = selection?.mask.getContext('2d', { willReadFrequently: true })
    if (!layer || !surface || !surfaceContext || !canvas || !canvasContext || !selection?.bounds || !selectionContext || layerIsLocked(document, layer)) return
    const bounds = getLayerBounds(canvasContext, canvas, layer, assets)
    if (!bounds) return
    const sourceRegion = documentRegionToSourceRegion(selection.bounds, bounds, surface.width, surface.height)
    if (!sourceRegion) { setNotice('The selection does not overlap the selected raster layer.'); return }
    const selectionData = selectionContext.getImageData(0, 0, selection.mask.width, selection.mask.height)
    const input = surfaceContext.getImageData(0, 0, surface.width, surface.height)
    const beforeRegion = extractImageData(input, sourceRegion.x, sourceRegion.y, sourceRegion.width, sourceRegion.height)
    const mask = new Uint8Array(surface.width * surface.height)
    const angle = bounds.rotation * Math.PI / 180
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2
    let left = surface.width
    let top = surface.height
    let right = -1
    let bottom = -1
    for (let row = 0; row < sourceRegion.height; row += 1) for (let column = 0; column < sourceRegion.width; column += 1) {
      const x = sourceRegion.x + column
      const y = sourceRegion.y + row
      const layerX = (x / surface.width - 0.5) * bounds.width
      const layerY = (y / surface.height - 0.5) * bounds.height
      const documentX = centerX + layerX * Math.cos(angle) - layerY * Math.sin(angle)
      const documentY = centerY + layerX * Math.sin(angle) + layerY * Math.cos(angle)
      if (selectionAlphaAt(selectionData, documentX, documentY) < 0.5) continue
      mask[y * surface.width + x] = 1
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y)
    }
    if (right < left) { setNotice('The selection does not overlap the selected raster layer.'); return }
    setIsLoading(true)
    setNotice('Content-aware fill is matching local texture patches…', 'info')
    try {
      const worker = new Worker(new URL('./editor/workers/patch-match.worker.ts', import.meta.url), { type: 'module' })
      const width = right - left + 1
      const height = bottom - top + 1
      const response = await runWorkerJob<{ data?: ArrayBuffer; error?: string }>(
        'Content-aware fill',
        worker,
        { data: input.data.buffer, mask: mask.buffer, width: input.width, height: input.height, resultRegion: { x: left, y: top, width, height } },
        [input.data.buffer, mask.buffer],
      )
      if (response.error || !response.data) throw new Error(response.error || 'The local PatchMatch worker returned no pixels.')
      const after = new ImageData(new Uint8ClampedArray(response.data), width, height)
      surfaceContext.putImageData(after, left, top)
      refreshRasterAsset(layer.assetId, { x: left, y: top, width, height })
      commitRasterEdit({ assetId: layer.assetId, x: left, y: top, before: extractImageData(beforeRegion, left - sourceRegion.x, top - sourceRegion.y, width, height), after })
      setNotice(`Filled ${width} × ${height}px using local PatchMatch.`, 'success')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice(error instanceof Error ? error.message : 'Content-aware fill could not finish.')
    } finally {
      setIsLoading(false)
    }
  }

  const transformCanvas = (kind: 'rotate-cw' | 'rotate-ccw' | 'flip-x' | 'flip-y') => {
    const canvas = canvasRef.current
    const canvasContext = canvas?.getContext('2d')
    const { width: oldWidth, height: oldHeight } = getDocumentSize(document)
    const rotates = kind === 'rotate-cw' || kind === 'rotate-ccw'
    const width = rotates ? oldHeight : oldWidth
    const height = rotates ? oldWidth : oldHeight
    const nextAssets: AssetMap = {}
    const normalizeRotation = (value: number) => ((value + 180) % 360 + 360) % 360 - 180
    const changes = document.layers.map((layer) => {
      const patch: LayerPatch = {}
      if (kind === 'rotate-cw') {
        patch.position = { x: -layer.position.y, y: layer.position.x }
        patch.rotation = normalizeRotation(layer.rotation + 90)
      } else if (kind === 'rotate-ccw') {
        patch.position = { x: layer.position.y, y: -layer.position.x }
        patch.rotation = normalizeRotation(layer.rotation - 90)
      } else if (kind === 'flip-x') {
        patch.position = { x: -layer.position.x, y: layer.position.y }
        patch.rotation = normalizeRotation(-layer.rotation)
        patch.flipX = !layer.flipX
      } else {
        patch.position = { x: layer.position.x, y: -layer.position.y }
        patch.rotation = normalizeRotation(-layer.rotation)
        patch.flipY = !layer.flipY
      }
      if (rotates && layer.type === 'shape') {
        patch.width = layer.width / 100 * oldWidth / width * 100
        patch.height = layer.height / 100 * oldHeight / height * 100
      }
      if (rotates && layer.type === 'image' && canvas && canvasContext) {
        const source = assets[layer.assetId]
        const bounds = getLayerBounds(canvasContext, canvas, layer, assets)
        const imageWidth = source?.element.naturalWidth || source?.surface?.width || 1
        const imageHeight = source?.element.naturalHeight || source?.surface?.height || 1
        if (bounds) {
          const base = calculateImageRect(width, height, imageWidth, imageHeight, { ...layer, position: { x: 0, y: 0 }, scale: 100 })
          patch.scale = bounds.width / Math.max(1, base.width) * 100
        }
      }
      if (layer.maskAssetId) {
        const source = assets[layer.maskAssetId]
        if (source?.surface) {
          const assetId = createId()
          const transformed = createEmptyRasterSource(width, height, source.name)
          const context = transformed.surface?.getContext('2d', { willReadFrequently: true })
          if (context) {
            context.save()
            if (kind === 'rotate-cw') {
              context.translate(width, 0)
              context.rotate(Math.PI / 2)
            } else if (kind === 'rotate-ccw') {
              context.translate(0, height)
              context.rotate(-Math.PI / 2)
            } else if (kind === 'flip-x') {
              context.translate(width, 0)
              context.scale(-1, 1)
            } else {
              context.translate(0, height)
              context.scale(1, -1)
            }
            context.drawImage(source.surface, 0, 0, oldWidth, oldHeight)
            context.restore()
            transformed.contentBounds = undefined
            nextAssets[assetId] = transformed
            patch.maskAssetId = assetId
          }
        }
      }
      return { id: layer.id, patch }
    })
    if (Object.keys(nextAssets).length) setAssets((current) => ({ ...current, ...nextAssets }))
    dispatch({ type: 'set-canvas-size', width, height }, { groupKey: 'transform-canvas' })
    dispatch({ type: 'update-layers', changes }, { groupKey: 'transform-canvas' })
    const angle = document.background.gradientAngle
    const gradientAngle = kind === 'rotate-cw' ? angle + 90 : kind === 'rotate-ccw' ? angle - 90 : kind === 'flip-x' ? 180 - angle : -angle
    dispatch({ type: 'set-background', patch: { gradientAngle: normalizeRotation(gradientAngle) } }, { groupKey: 'transform-canvas' })
    endHistoryGroup()
    setSelection(null)
  }

  const rasterizeSelectedLayer = () => {
    const layer = selectedLayers.length === 1 ? selectedLayers[0] : null
    if (!layer || layer.type === 'raster' || layer.type === 'adjustment') return
    const { width, height } = getDocumentSize(document)
    const canvas = window.document.createElement('canvas')
    canvas2dCompositionRenderer.render(canvas, {
      ...document,
      background: { ...document.background, kind: 'transparent' },
      pattern: { ...document.pattern, kind: 'none' },
      groups: [],
      layers: [{ ...layer, groupId: null, stackOrder: 0, visible: true, locked: false, clipToBelow: false }],
      selectedLayerId: null,
      selectedLayerIds: [],
      selectedGroupId: null,
    }, assets)
    const assetId = createId()
    const source = createEmptyRasterSource(width, height, `${layer.name} pixels`)
    source.surface?.getContext('2d')?.drawImage(canvas, 0, 0)
    source.contentBounds = undefined
    const raster = {
      ...createRasterLayer(assetId, layer.name, width, height),
      id: layer.id,
      visible: layer.visible,
      locked: layer.locked,
      groupId: layer.groupId,
      stackOrder: layer.stackOrder,
    }
    setAssets((current) => ({ ...current, [assetId]: source }))
    dispatch({ type: 'replace-layer', id: layer.id, layer: raster })
  }

  const convertSelectedToSmartObject = () => {
    const layer = selectedLayers.length === 1 ? selectedLayers[0] : null
    if (!layer || layer.type === 'adjustment' || layer.type === 'smart-object') return
    const { width, height } = getDocumentSize(document)
    const canvas = window.document.createElement('canvas')
    const contentLayer = {
      ...layer,
      opacity: 100,
      blendMode: 'normal',
      groupId: null,
      stackOrder: 0,
      visible: true,
      locked: false,
      clipToBelow: false,
      maskAssetId: null,
      maskSettings: undefined,
      vectorMask: undefined,
      blendIf: undefined,
      effects: null,
      additionalEffects: [],
    } as EditorLayer
    const embeddedDocument = {
      ...structuredClone(initialDocument),
      canvasPreset: 'custom' as const,
      canvasSize: { width, height },
      layers: [contentLayer],
      selectedLayerId: contentLayer.id,
      selectedLayerIds: [contentLayer.id],
    }
    canvas2dCompositionRenderer.render(canvas, embeddedDocument, assets)
    const assetId = createId()
    const source = createEmptyRasterSource(width, height, `${layer.name} smart-object preview`)
    source.surface?.getContext('2d')?.drawImage(canvas, 0, 0)
    source.contentBounds = undefined
    const smartObject = {
      ...createSmartObjectLayer(assetId, layer.name, width, height, { kind: 'embedded', fileName: `${layer.name}.studio` }),
      transformMatrix: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
      id: layer.id,
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      groupId: layer.groupId,
      stackOrder: layer.stackOrder,
      maskAssetId: layer.maskAssetId,
      maskSettings: layer.maskSettings,
      vectorMask: layer.vectorMask,
      blendIf: layer.blendIf,
      clipToBelow: layer.clipToBelow,
      effects: layer.effects,
      additionalEffects: layer.additionalEffects,
      embeddedDocument,
      contentHash: smartObjectDocumentHash(embeddedDocument, assets),
    }
    setAssets((current) => ({ ...current, [assetId]: source }))
    dispatch({ type: 'replace-layer', id: layer.id, layer: smartObject })
    setNotice(`Converted ${layer.name} to an embedded smart object.`, 'success')
  }

  const openSmartObjectContents = () => {
    const layer = selectedLayers.length === 1 ? selectedLayers[0] : null
    if (!layer || layer.type !== 'smart-object' || !layer.embeddedDocument) return
    setSmartObjectSessions((current) => [...current, { parentHistory: history, layerId: layer.id, assetId: layer.assetId, name: layer.name }])
    historyDispatch({ type: 'replace', document: structuredClone(layer.embeddedDocument) })
    setSelection(null)
    setEditingMaskLayerId(null)
    setNotice(`Editing ${layer.name}. Save the contents to update every instance.`, 'info')
  }

  const closeSmartObjectContents = (save: boolean) => {
    const session = smartObjectSessions.at(-1)
    if (!session) return
    const editedDocument = history.present
    if (save) {
      const preview = window.document.createElement('canvas')
      canvas2dCompositionRenderer.render(preview, { ...editedDocument, selectedLayerId: null, selectedLayerIds: [], selectedGroupId: null }, assets)
      setAssets((current) => {
        const source = current[session.assetId]
        if (!source) return current
        const surface = source.surface ?? window.document.createElement('canvas')
        surface.width = preview.width
        surface.height = preview.height
        const context = surface.getContext('2d')
        context?.clearRect(0, 0, surface.width, surface.height)
        context?.drawImage(preview, 0, 0)
        const next = { ...source, surface, revision: (source.revision ?? 0) + 1 }
        void surfaceToBlob(surface).then((blob) => setAssets((latest) => latest[session.assetId] ? { ...latest, [session.assetId]: { ...latest[session.assetId], blob } } : latest))
        return { ...current, [session.assetId]: next }
      })
      historyDispatch({ type: 'restore', state: session.parentHistory })
      historyDispatch({ type: 'apply', action: { type: 'update-layer', id: session.layerId, patch: { embeddedDocument: editedDocument, contentHash: smartObjectDocumentHash(editedDocument, assets) } } })
      setNotice(`Saved ${session.name} contents and refreshed its preview.`, 'success')
    } else {
      historyDispatch({ type: 'restore', state: session.parentHistory })
      setNotice(`Discarded changes to ${session.name}.`, 'info')
    }
    setSmartObjectSessions((current) => current.slice(0, -1))
    setSelection(null)
    setEditingMaskLayerId(null)
  }

  const replaceSmartObjectSource = async (file: File, kind: 'embedded' | 'linked') => {
    const layer = selectedLayers.length === 1 ? selectedLayers[0] : null
    if (!layer || layer.type !== 'smart-object') return
    setIsLoading(true)
    try {
      const loaded = await loadImageFile(file)
      const contentHash = smartObjectBytesHash(new Uint8Array(await file.arrayBuffer()))
      const width = loaded.element.naturalWidth || loaded.surface?.width || 1
      const height = loaded.element.naturalHeight || loaded.surface?.height || 1
      let embeddedDocument = layer.embeddedDocument
      const additions: AssetMap = { [layer.assetId]: loaded }
      if (kind === 'embedded') {
        const contentAssetId = createId()
        const content = createRasterSurface(loaded)
        additions[contentAssetId] = content
        const contentLayer = createRasterLayer(contentAssetId, file.name.replace(/\.[^.]+$/, ''), width, height)
        embeddedDocument = {
          ...structuredClone(initialDocument),
          canvasPreset: 'custom',
          canvasSize: { width, height },
          layers: [contentLayer],
          selectedLayerId: contentLayer.id,
          selectedLayerIds: [contentLayer.id],
        }
      } else embeddedDocument = undefined
      setAssets((current) => ({ ...current, ...additions }))
      dispatch({
        type: 'update-layer',
        id: layer.id,
        patch: {
          width,
          height,
          embeddedDocument,
          contentHash,
          source: { kind, fileName: file.name, mimeType: file.type || undefined, lastModified: file.lastModified },
        },
      })
      setNotice(`${kind === 'linked' ? 'Relinked' : 'Replaced'} ${layer.name} with ${file.name}.`, 'success')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The smart-object source could not be replaced.')
    } finally {
      setIsLoading(false)
    }
  }

  const exportSmartObjectContents = async () => {
    const layer = selectedLayers.length === 1 ? selectedLayers[0] : null
    if (!layer || layer.type !== 'smart-object') return
    try {
      await runCancelableJob('Smart object export', async (signal) => {
        if (layer.embeddedDocument) {
          const json = await serializeProject(layer.embeddedDocument, assets, signal)
          signal.throwIfAborted()
          downloadBlob(new Blob([json], { type: 'application/x-studio+json' }), layer.source.fileName.replace(/\.[^.]+$/, '') + '.studio')
          return
        }
        const source = assets[layer.assetId]
        const blob = source?.blob ?? (source?.surface ? await surfaceToBlob(source.surface) : undefined)
        signal.throwIfAborted()
        if (!blob) throw new Error('This smart object does not have exportable local contents.')
        downloadBlob(blob, layer.source.fileName)
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice(error instanceof Error ? error.message : 'The smart-object contents could not be exported.')
    }
  }

  const applyFilter = (patch: Partial<LayerFilters>) => {
    const targets = selectedLayers.filter((layer) => layer.type !== 'adjustment' && !layerIsLocked(document, layer))
    if (!targets.length) return
    dispatch({
      type: 'update-layers',
      changes: targets.map((layer) => ({ id: layer.id, patch: { filters: { ...normalizeLayerFilters(layer.filters), ...patch } } })),
    })
  }

  const resetFilters = () => applyFilter(defaultLayerFilters)

  const applyPluginFilter = async (filter: PluginFilterHook) => {
    const layer = selectedLayers.length === 1 && selectedLayers[0].type === 'raster' ? selectedLayers[0] : null
    const surface = layer ? assets[layer.assetId]?.surface : null
    const context = surface?.getContext('2d', { willReadFrequently: true })
    if (!layer || !surface || !context || layerIsLocked(document, layer)) return
    setIsLoading(true)
    setNotice(`Applying ${filter.label} in a local worker… Press Escape to cancel.`, 'info')
    try {
      const input = context.getImageData(0, 0, surface.width, surface.height)
      const worker = new Worker(new URL('./editor/workers/color-matrix.worker.ts', import.meta.url), { type: 'module' })
      const response = await runWorkerJob<{ before?: ArrayBuffer; after?: ArrayBuffer; error?: string }>(
        filter.label,
        worker,
        { data: input.data.buffer, width: input.width, height: input.height, matrix: filter.matrix },
        [input.data.buffer],
      )
      if (response.error || !response.before || !response.after) throw new Error(response.error || 'The plugin filter returned no pixels.')
      const before = new ImageData(new Uint8ClampedArray(response.before), surface.width, surface.height)
      const after = new ImageData(new Uint8ClampedArray(response.after), surface.width, surface.height)
      context.putImageData(after, 0, 0)
      refreshRasterAsset(layer.assetId, { x: 0, y: 0, width: surface.width, height: surface.height })
      commitRasterEdit({ assetId: layer.assetId, x: 0, y: 0, before, after })
      setNotice(`Applied ${filter.label} from a local plugin.`, 'success')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice(error instanceof Error ? error.message : `${filter.label} could not finish.`)
    } finally {
      setIsLoading(false)
    }
  }

  const deleteSelection = () => {
    if (selectedGroup && !groupIsLocked(document, selectedGroup)) dispatch({ type: 'remove-group', id: selectedGroup.id, deleteLayers: true })
    else {
      const ids = selectedLayers.filter((layer) => !layerIsLocked(document, layer)).map((layer) => layer.id)
      if (ids.length) dispatch({ type: 'remove-layers', ids })
    }
  }

  const applySelectAll = () => {
    const size = getDocumentSize(document)
    setSelection(selectAll(size.width, size.height))
  }

  const applySelectionOperation = (operation: 'invert' | 'feather' | 'expand' | 'contract') => {
    const size = getDocumentSize(document)
    setSelection((current) => {
      if (operation === 'invert') return invertSelection(current, size.width, size.height)
      if (operation === 'feather') return featherSelection(current, 4)
      return morphSelection(current, 4, operation)
    })
  }

  const canvasSelectionImage = () => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d', { willReadFrequently: true })
    return canvas && context ? { canvas, image: context.getImageData(0, 0, canvas.width, canvas.height) } : null
  }

  const selectColorRange = () => {
    const source = canvasSelectionImage()
    if (!source) return
    const color = foregroundColor.replace('#', '')
    const rgb: [number, number, number] = [Number.parseInt(color.slice(0, 2), 16), Number.parseInt(color.slice(2, 4), 16), Number.parseInt(color.slice(4, 6), 16)]
    setSelection(applySelectionAlphaMask(null, colorRangeMask(source.image, rgb, 32), 'replace', source.canvas.width, source.canvas.height))
  }

  const selectLuminosityRange = (range: 'shadows' | 'midtones' | 'highlights') => {
    const source = canvasSelectionImage()
    if (!source) return
    const limits = range === 'shadows' ? [0, 85] : range === 'highlights' ? [170, 255] : [64, 191]
    setSelection(applySelectionAlphaMask(null, luminosityRangeMask(source.image, limits[0], limits[1], 24), 'replace', source.canvas.width, source.canvas.height))
  }

  const selectEdges = () => {
    const source = canvasSelectionImage()
    if (source) setSelection(applySelectionAlphaMask(null, edgeSelectionMask(source.image), 'replace', source.canvas.width, source.canvas.height))
  }

  const growOrSelectSimilar = (kind: 'grow' | 'similar') => {
    const source = canvasSelectionImage()
    if (!source || !selection) return
    const alpha = kind === 'grow' ? growSelectionMask(selection, source.image, 32) : similarSelectionMask(selection, source.image, 32)
    setSelection(applySelectionAlphaMask(null, alpha, 'replace', source.canvas.width, source.canvas.height))
  }

  const loadComponentChannel = (channel: ComponentChannel, mode: SelectionMode) => {
    const source = canvasSelectionImage()
    if (!source) return
    setSelection((current) => applySelectionAlphaMask(current, componentChannelMask(source.image, channel), mode, source.canvas.width, source.canvas.height))
    setNotice(`Loaded the ${channel} channel into the selection.`, 'success')
  }

  const alphaChannelIndex = (channel: DocumentChannel) => {
    const channels = document.channels ?? []
    const byReference = channels.indexOf(channel)
    return byReference >= 0 ? byReference : channels.findIndex((candidate) => candidate.id === channel.id && candidate.name === channel.name)
  }

  const channelPixels = (channel: DocumentChannel) => {
    const source = channel.assetId ? assets[channel.assetId] : undefined
    const input = source?.surface ?? source?.element
    const size = getDocumentSize(document)
    if (!input) return null
    const canvas = window.document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(input, 0, 0, size.width, size.height)
    const image = context.getImageData(0, 0, size.width, size.height)
    const alpha = new Uint8ClampedArray(size.width * size.height)
    for (let pixel = 0; pixel < alpha.length; pixel += 1) alpha[pixel] = image.data[pixel * 4]
    return { alpha, image, size }
  }

  const saveAlphaChannel = (name: string) => {
    if (!selection) return
    const size = getDocumentSize(document)
    const source = createEmptyRasterSource(size.width, size.height, `${name} channel`)
    const context = source.surface?.getContext('2d', { willReadFrequently: true })
    const maskContext = selection.mask.getContext('2d', { willReadFrequently: true })
    if (!context || !maskContext) return
    const mask = maskContext.getImageData(0, 0, size.width, size.height)
    const pixels = context.createImageData(size.width, size.height)
    for (let pixel = 0; pixel < size.width * size.height; pixel += 1) {
      const value = mask.data[pixel * 4 + 3]
      const offset = pixel * 4
      pixels.data[offset] = value
      pixels.data[offset + 1] = value
      pixels.data[offset + 2] = value
      pixels.data[offset + 3] = 255
    }
    context.putImageData(pixels, 0, 0)
    source.contentBounds = undefined
    const assetId = createId()
    const id = Math.max(1, ...((document.channels ?? []).map((channel) => channel.id ?? 0))) + 1
    setAssets((current) => ({ ...current, [assetId]: source }))
    dispatch({ type: 'set-channels', channels: [...(document.channels ?? []), { id, name, assetId }] })
    setNotice(`Saved the selection as ${name}.`, 'success')
  }

  const loadAlphaChannel = (channel: DocumentChannel, mode: SelectionMode) => {
    const pixels = channelPixels(channel)
    if (!pixels) {
      setNotice(`${channel.name} has no editable pixel data.`)
      return
    }
    setSelection((current) => applySelectionAlphaMask(current, pixels.alpha, mode, pixels.size.width, pixels.size.height))
    setNotice(`Loaded ${channel.name} into the selection.`, 'success')
  }

  const duplicateAlphaChannel = (channel: DocumentChannel) => {
    const source = channel.assetId ? assets[channel.assetId] : undefined
    if (!source) return
    const assetId = createId()
    const name = `${channel.name} copy`
    const copy = cloneRasterSource(source, `${name} channel`)
    const id = Math.max(1, ...((document.channels ?? []).map((candidate) => candidate.id ?? 0))) + 1
    setAssets((current) => ({ ...current, [assetId]: copy }))
    dispatch({ type: 'set-channels', channels: [...(document.channels ?? []), { id, name, assetId }] })
    setNotice(`Duplicated ${channel.name}.`, 'success')
  }

  const deleteAlphaChannel = (channel: DocumentChannel) => {
    const index = alphaChannelIndex(channel)
    if (index < 0) return
    dispatch({ type: 'set-channels', channels: (document.channels ?? []).filter((_, candidate) => candidate !== index) })
    setNotice(`Deleted ${channel.name}.`, 'success')
  }

  const transformAlphaChannel = (channel: DocumentChannel, operation: AlphaChannelTransform) => {
    const source = channel.assetId ? assets[channel.assetId] : undefined
    const input = source?.surface ?? source?.element
    const index = alphaChannelIndex(channel)
    const size = getDocumentSize(document)
    if (!input || index < 0) return
    const transformed = createEmptyRasterSource(size.width, size.height, `${channel.name} channel`)
    const context = transformed.surface?.getContext('2d', { willReadFrequently: true })
    if (!context) return
    if (operation === 'invert') {
      context.drawImage(input, 0, 0, size.width, size.height)
      const pixels = context.getImageData(0, 0, size.width, size.height)
      for (let pixel = 0; pixel < size.width * size.height; pixel += 1) {
        const offset = pixel * 4
        const value = 255 - pixels.data[offset]
        pixels.data[offset] = value
        pixels.data[offset + 1] = value
        pixels.data[offset + 2] = value
        pixels.data[offset + 3] = 255
      }
      context.putImageData(pixels, 0, 0)
    } else {
      context.save()
      context.translate(size.width / 2, size.height / 2)
      if (operation === 'flip-horizontal') context.scale(-1, 1)
      else if (operation === 'flip-vertical') context.scale(1, -1)
      else context.rotate(Math.PI / 2)
      context.drawImage(input, -size.width / 2, -size.height / 2, size.width, size.height)
      context.restore()
    }
    transformed.contentBounds = undefined
    const assetId = createId()
    setAssets((current) => ({ ...current, [assetId]: transformed }))
    dispatch({ type: 'set-channels', channels: (document.channels ?? []).map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, assetId } : candidate) })
    setNotice(`Updated ${channel.name}.`, 'success')
  }

  const addPathShape = (path: DocumentPath, mode: 'fill' | 'stroke') => {
    const layer = createShapeLayer('path', document.layers.filter((candidate) => candidate.type === 'shape' && candidate.shape === 'path').length + 1)
    layer.name = `${path.name} ${mode}`
    layer.width = 100
    layer.height = 100
    layer.position = { x: 0, y: 0 }
    layer.vectorPaths = structuredClone(path.paths)
    layer.fill = mode === 'fill' ? foregroundColor : 'transparent'
    layer.stroke = foregroundColor
    layer.strokeWidth = mode === 'stroke' ? 3 : 0
    dispatch({ type: 'add-layer', layer })
    setNotice(`${mode === 'fill' ? 'Filled' : 'Stroked'} ${path.name} on a new editable shape layer.`, 'success')
  }

  const saveCustomShape = (path: DocumentPath) => {
    const preset = { id: createId(), name: path.name, paths: structuredClone(path.paths) }
    setCustomShapes((current) => normalizeCustomShapes([...current, preset]))
    setNotice(`Added ${path.name} to the local custom-shape library.`, 'success')
  }

  const applyCustomShape = (shape: CustomShapePreset) => addPathShape({ id: shape.id, name: shape.name, kind: 'saved', paths: shape.paths }, 'fill')

  const loadCustomShapeFile = async (file: File) => {
    try {
      const shape = await parseCustomShapeFile(file)
      setCustomShapes((current) => normalizeCustomShapes([...current.filter((candidate) => candidate.id !== shape.id), shape]))
      setNotice(`Imported ${shape.name} into the local custom-shape library.`, 'success')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That custom shape could not be imported.')
    }
  }

  const exportDocumentPath = (path: DocumentPath) => {
    const fileName = `${path.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-shape'}.studio-shape`
    downloadBlob(serializeCustomShape({ id: path.id, name: path.name, paths: path.paths }), fileName)
  }

  const exportImage = async (format: ExportFormat) => {
    setIsExporting(true)
    if (format === 'svg') {
      const { exportSvgDocument } = await import('./editor/svg')
      downloadBlob(exportSvgDocument(document), 'studio-composition.svg')
      setIsExporting(false)
      return
    }
    if (format === 'psd' || format === 'psb') {
      let writable: BrowserWritable | null = null
      try {
        const filename = `studio-composition.${format}`
        writable = await openBrowserWritable(filename, format === 'psb' ? 'Photoshop large document' : 'Photoshop document', 'image/vnd.adobe.photoshop', [`.${format}`])
        await runCancelableJob(`${format.toUpperCase()} export`, async (signal) => {
          const { exportPsdDocument } = await import('./editor/psd')
          const blob = await exportPsdDocument(document, assets, format === 'psb', signal)
          signal.throwIfAborted()
          if (writable) await writeBlobIncrementally(writable, blob, signal)
          else downloadBlob(blob, filename)
        })
      } catch (error) {
        await writable?.abort?.(error).catch(() => undefined)
        if (error instanceof DOMException && error.name === 'AbortError') return
        setNotice(error instanceof Error ? error.message : 'The layered PSD could not be created.')
      } finally {
        setIsExporting(false)
      }
      return
    }
    const exportCanvas = window.document.createElement('canvas')
    canvas2dCompositionRenderer.render(exportCanvas, { ...document, selectedLayerId: null }, assets)
    if (['tiff', 'pdf', 'gif', 'apng', 'avif'].includes(format)) {
      try {
        const pixelsFor = (canvas: HTMLCanvasElement) => {
          const context = canvas.getContext('2d', { willReadFrequently: true })
          if (!context) throw new Error('The exported canvas pixels are unavailable.')
          return context.getImageData(0, 0, canvas.width, canvas.height)
        }
        const composite = { name: 'Composite', pixels: pixelsFor(exportCanvas), delayMs: 100 }
        const layerFrames = document.layers.filter((layer) => layer.visible && layer.type !== 'adjustment').map((layer) => {
          const canvas = window.document.createElement('canvas')
          canvas2dCompositionRenderer.render(canvas, { ...document, background: { ...document.background, kind: 'transparent' }, layers: [layer], selectedLayerId: null, selectedLayerIds: [] }, assets)
          return { name: layer.name, pixels: pixelsFor(canvas), delayMs: 100 }
        })
        const animationFrames: typeof layerFrames = []
        if ((format === 'gif' || format === 'apng') && document.animation) {
          const animationDocument = { ...document, animation: { ...document.animation, onionSkin: false } }
          const previews = document.animation.mode === 'frame'
            ? document.animation.frames.map((frame, frameIndex) => ({ name: frame.name, frameIndex, time: 0, delayMs: frame.delayMs }))
            : Array.from({ length: Math.min(600, Math.max(1, Math.ceil(document.animation.duration * document.animation.fps))) }, (_, frameIndex) => ({ name: `Frame ${frameIndex + 1}`, frameIndex: 0, time: frameIndex / document.animation!.fps, delayMs: Math.round(1000 / document.animation!.fps) }))
          for (const preview of previews) {
            const canvas = window.document.createElement('canvas')
            canvas2dCompositionRenderer.render(canvas, animationDocumentAt(animationDocument, preview), assets)
            animationFrames.push({ name: preview.name, pixels: pixelsFor(canvas), delayMs: preview.delayMs })
          }
        }
        const frames = format === 'tiff'
          ? [composite, ...layerFrames]
          : format === 'gif' || format === 'apng'
            ? animationFrames.length ? animationFrames : layerFrames.length ? layerFrames : [composite]
            : [composite]
        const worker = new Worker(new URL('./editor/workers/raster-export.worker.ts', import.meta.url), { type: 'module' })
        const response = await runWorkerJob<{ blob?: Blob; error?: string }>(`${format.toUpperCase()} export`, worker, {
          format,
          frames,
          dpi: document.fileMetadata?.resolutionDpi ?? (format === 'pdf' ? 300 : 72),
          metadata: { title: document.canvasPreset, author: document.fileMetadata?.author, description: document.fileMetadata?.description },
        }, frames.map((frame) => frame.pixels.data.buffer))
        if (response.error || !response.blob) throw new Error(response.error || `The ${format.toUpperCase()} encoder returned no file.`)
        const blob = response.blob
        downloadBlob(blob, `studio-composition.${format === 'tiff' ? 'tif' : format === 'apng' ? 'png' : format}`)
        setNotice(format === 'tiff' ? `Exported a multipage TIFF with a composite and ${layerFrames.length} layer page${layerFrames.length === 1 ? '' : 's'}.` : `Exported ${format.toUpperCase()} locally.`, 'success')
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setNotice(error instanceof Error ? error.message : `The ${format.toUpperCase()} could not be created.`)
      } finally {
        setIsExporting(false)
      }
      return
    }
    try {
      await runCancelableJob(`${format.toUpperCase()} export`, async (signal) => {
        const blob = await canvasBlob(exportCanvas, `image/${format}`, format === 'png' ? undefined : 0.92, signal)
        const { applyImageMetadata } = await import('./editor/metadata')
        const tagged = await applyImageMetadata(blob, format, document.fileMetadata ?? {})
        signal.throwIfAborted()
        downloadBlob(tagged, `studio-composition.${format === 'jpeg' ? 'jpg' : format}`)
      })
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setNotice(error instanceof Error ? error.message : 'Image metadata could not be written.')
    } finally { setIsExporting(false) }
  }

  const exportArtboards = async () => {
    if (!document.artboards?.length) return
    setIsExporting(true)
    try {
      await runCancelableJob('Artboard export', async (signal) => {
        const composition = window.document.createElement('canvas')
        canvas2dCompositionRenderer.render(composition, { ...document, selectedLayerId: null, selectedLayerIds: [] }, assets)
        for (const [index, artboard] of document.artboards!.entries()) {
          signal.throwIfAborted()
          const output = window.document.createElement('canvas')
          output.width = Math.max(1, Math.round(artboard.width))
          output.height = Math.max(1, Math.round(artboard.height))
          output.getContext('2d')?.drawImage(composition, artboard.x, artboard.y, artboard.width, artboard.height, 0, 0, output.width, output.height)
          const blob = await canvasBlob(output, 'image/png', undefined, signal)
          const name = artboard.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `artboard-${index + 1}`
          signal.throwIfAborted()
          downloadBlob(blob, `${name}.png`)
        }
      })
      setNotice(`Exported ${document.artboards.length} artboard${document.artboards.length === 1 ? '' : 's'} locally.`, 'success')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice(error instanceof Error ? error.message : 'The artboards could not be exported.')
    } finally {
      setIsExporting(false)
    }
  }

  const exportGeneratedAssets = async (settings: AssetExportSettings) => {
    setIsExporting(true)
    try {
      const targetCount = await runCancelableJob('Asset export', async (signal) => {
        const composition = window.document.createElement('canvas')
        canvas2dCompositionRenderer.render(composition, { ...document, selectedLayerId: null, selectedLayerIds: [] }, assets)
        const safeName = (name: string, fallback: string) => name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback
        const targets: Array<{ name: string; source: HTMLCanvasElement; x: number; y: number; width: number; height: number }> = []
        if (settings.targets === 'document') targets.push({ name: 'studio-composition', source: composition, x: 0, y: 0, width: composition.width, height: composition.height })
        else if (settings.targets === 'slices') for (const [index, slice] of (document.slices ?? []).entries()) targets.push({ name: safeName(slice.name, `slice-${index + 1}`), source: composition, x: slice.x, y: slice.y, width: slice.width, height: slice.height })
        else if (settings.targets === 'artboards') for (const [index, artboard] of (document.artboards ?? []).entries()) targets.push({ name: safeName(artboard.name, `artboard-${index + 1}`), source: composition, x: artboard.x, y: artboard.y, width: artboard.width, height: artboard.height })
        else {
          const boundsContext = composition.getContext('2d')
          if (!boundsContext) throw new Error('Layer bounds are unavailable for export.')
          for (const [index, layer] of document.layers.filter((candidate) => candidate.visible && candidate.type !== 'adjustment').entries()) {
            const surface = window.document.createElement('canvas')
            canvas2dCompositionRenderer.render(surface, { ...document, background: { ...document.background, kind: 'transparent' }, layers: [layer], selectedLayerId: null, selectedLayerIds: [] }, assets)
            const bounds = getLayerBounds(boundsContext, composition, layer, assets) ?? { x: 0, y: 0, width: composition.width, height: composition.height }
            targets.push({ name: safeName(layer.name, `layer-${index + 1}`), source: surface, x: Math.floor(bounds.x), y: Math.floor(bounds.y), width: Math.ceil(bounds.width), height: Math.ceil(bounds.height) })
          }
        }
        if (!targets.length) throw new Error(`There are no ${settings.targets} to export.`)
        for (const target of targets) {
          signal.throwIfAborted()
          const outputCanvas = window.document.createElement('canvas')
          outputCanvas.width = Math.max(1, Math.round(target.width * settings.scale))
          outputCanvas.height = Math.max(1, Math.round(target.height * settings.scale))
          const context = outputCanvas.getContext('2d', { willReadFrequently: true })
          if (!context) throw new Error('Could not allocate an asset export surface.')
          context.imageSmoothingEnabled = true
          context.imageSmoothingQuality = 'high'
          context.drawImage(target.source, target.x, target.y, target.width, target.height, 0, 0, outputCanvas.width, outputCanvas.height)
          let blob: Blob
          if (settings.format === 'avif') {
            const frame = { name: target.name, pixels: context.getImageData(0, 0, outputCanvas.width, outputCanvas.height) }
            const worker = new Worker(new URL('./editor/workers/raster-export.worker.ts', import.meta.url), { type: 'module' })
            const response = await runWorkerTask<{ blob?: Blob; error?: string }>('AVIF asset export', worker, { format: 'avif', frames: [frame] }, [frame.pixels.data.buffer], signal)
            if (response.error || !response.blob) throw new Error(response.error || `Could not encode ${target.name}.`)
            blob = response.blob
          } else {
            const mime = settings.format === 'jpeg' ? 'image/jpeg' : `image/${settings.format}`
            blob = await canvasBlob(outputCanvas, mime, settings.format === 'png' ? undefined : settings.quality / 100, signal)
          }
          const extension = settings.format === 'jpeg' ? 'jpg' : settings.format
          const { applyImageMetadata } = await import('./editor/metadata')
          const tagged = await applyImageMetadata(blob, settings.format, document.fileMetadata ?? {}, settings.stripMetadata)
          signal.throwIfAborted()
          downloadBlob(tagged, `${target.name}${settings.suffix}.${extension}`)
        }
        return targets.length
      })
      setNotice(`Generated ${targetCount} ${settings.format.toUpperCase()} asset${targetCount === 1 ? '' : 's'} locally.`, 'success')
      setExportWorkspaceOpen(false)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice(error instanceof Error ? error.message : 'The assets could not be generated.')
    } finally { setIsExporting(false) }
  }

  const createPrintPdf = async (printImmediately: boolean) => {
    setIsExporting(true)
    try {
      const canvas = window.document.createElement('canvas')
      canvas2dCompositionRenderer.render(canvas, { ...document, selectedLayerId: null, selectedLayerIds: [] }, assets)
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('The print canvas pixels are unavailable.')
      const dpi = document.fileMetadata?.resolutionDpi ?? 300
      const settings = document.printSettings ?? { widthInches: canvas.width / dpi, heightInches: canvas.height / dpi, dpi, bleedInches: 0.125, cropMarks: true, center: true }
      const frame = { name: 'Studio composition', pixels: context.getImageData(0, 0, canvas.width, canvas.height) }
      const worker = new Worker(new URL('./editor/workers/raster-export.worker.ts', import.meta.url), { type: 'module' })
      const response = await runWorkerJob<{ blob?: Blob; error?: string }>('Print PDF export', worker, { format: 'print-pdf', frames: [frame], settings, metadata: { title: document.canvasPreset, author: document.fileMetadata?.author, description: document.fileMetadata?.description } }, [frame.pixels.data.buffer])
      if (response.error || !response.blob) throw new Error(response.error || 'The print PDF encoder returned no file.')
      const blob = response.blob
      if (printImmediately) {
        const url = URL.createObjectURL(blob)
        const frame = window.document.createElement('iframe')
        frame.title = 'Studio print document'
        frame.style.position = 'fixed'; frame.style.width = '1px'; frame.style.height = '1px'; frame.style.opacity = '0'; frame.style.pointerEvents = 'none'
        frame.onload = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); window.setTimeout(() => { frame.remove(); URL.revokeObjectURL(url) }, 60_000) }
        frame.src = url
        window.document.body.append(frame)
      } else downloadBlob(blob, 'studio-print.pdf')
      setNotice(printImmediately ? 'Opened the browser print workflow with a locally generated PDF.' : 'Exported the print-ready PDF.', 'success')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice(error instanceof Error ? error.message : 'The print PDF could not be created.')
    } finally { setIsExporting(false) }
  }

  const saveProject = async () => {
    setIsProjectSaving(true)
    setNotice(null)
    try {
      await runCancelableJob('Studio project save', async (signal) => {
        const writable = await openBrowserWritable('untitled.studio', 'Studio project', 'application/x-studio+json', ['.studio'])
        signal.throwIfAborted()
        if (writable) await writeProjectStream(writable, document, assets, signal)
        else {
          const json = await serializeProject(document, assets, signal)
          signal.throwIfAborted()
          downloadBlob(new Blob([json], { type: 'application/x-studio+json' }), 'untitled.studio')
        }
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice(error instanceof Error ? error.message : 'The project could not be saved.')
    } finally {
      setIsProjectSaving(false)
    }
  }

  const openDocumentTab = (name: string, nextDocument: typeof document, nextAssets: AssetMap) => {
    const id = createId()
    const nextHistory: HistoryState = { past: [], present: nextDocument, future: [], groupKey: null }
    setDocumentTabs((current) => [...current.map((tab) => tab.id === activeTabId ? { ...tab, history, assets } : tab), { id, name, history: nextHistory, assets: nextAssets }])
    setActiveTabId(id)
    historyDispatch({ type: 'restore', state: nextHistory })
    setAssets(nextAssets)
    rasterUndoRef.current = []
    rasterRedoRef.current = []
    bumpRasterHistory()
    setSelection(null)
    setEditingMaskLayerId(null)
  }

  const openProject = async (file: File) => {
    setIsLoading(true)
    setNotice(null)
    try {
      const loaded = await runCancelableJob('Studio project import', (signal) => parseProjectFile(file, signal))
      openDocumentTab(file.name.replace(/\.studio$/i, ''), loaded.document, loaded.assets)
      setNotice(`Opened ${file.name} entirely in your browser.`, 'success')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice(error instanceof Error ? error.message : 'The project could not be opened.')
    } finally {
      setIsLoading(false)
    }
  }

  const openFile = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase()
    const pluginImporter = plugins.flatMap((plugin) => plugin.hooks.importers.map((hook) => ({ plugin, hook }))).find(({ hook }) => extension && hook.extensions.includes(extension))
    if (extension === 'studio' || file.type === 'application/json' || file.type === 'application/x-studio+json') {
      await openProject(file)
      return
    }
    setIsLoading(true)
    setNotice(null)
    try {
      let loaded: { document: typeof document; assets: AssetMap }
      let importWarnings: string[] = []
      if (extension === 'psd' || file.type === 'image/vnd.adobe.photoshop') {
        const { importPsdFile } = await import('./editor/psd')
        const imported = await runCancelableJob('PSD import', (signal) => importPsdFile(file, signal))
        loaded = imported
        importWarnings = imported.warnings
      } else if (extension === 'svg' || file.type === 'image/svg+xml') {
        const { importSvgFile } = await import('./editor/svg')
        loaded = await runCancelableJob('SVG import', async (signal) => {
          signal.throwIfAborted()
          const imported = await importSvgFile(file)
          signal.throwIfAborted()
          return imported
        })
      } else {
        const advancedFormats = await import('./editor/advanced-formats')
        const advancedFormat = advancedFormats.advancedFormatForFile(file)
        if (advancedFormat) {
          const imported = await runCancelableJob(`${advancedFormat.toUpperCase()} import`, (signal) => advancedFormats.importAdvancedRaster(file, signal))
          const nextAssets: AssetMap = {}
          const layers = imported.pages.map((page, index) => {
            const assetId = createId()
            nextAssets[assetId] = page.source
            const layer = createRasterLayer(assetId, page.name.replace(/\.[^.]+$/, ''), page.width, page.height)
            layer.stackOrder = index
            return layer
          })
          loaded = {
            assets: nextAssets,
            document: {
              ...initialDocument,
              bitDepth: imported.bitDepth,
              canvasPreset: 'custom',
              canvasSize: { width: Math.max(...imported.pages.map((page) => page.width)), height: Math.max(...imported.pages.map((page) => page.height)) },
              background: { ...initialDocument.background, kind: 'transparent' },
              layers,
              selectedLayerId: layers[0]?.id ?? null,
              selectedLayerIds: layers[0] ? [layers[0].id] : [],
              fileMetadata: imported.metadata,
            },
          }
          importWarnings = imported.warnings
        } else {
          const { source, metadata } = await runCancelableJob('Image import', async (signal) => {
            const source = createRasterSurface(await loadImageFile(file, signal))
            const { readImageMetadata } = await import('./editor/metadata')
            const metadata = await readImageMetadata(file)
            signal.throwIfAborted()
            return { source, metadata }
          })
          const assetId = createId()
          const layer = createRasterLayer(assetId, file.name.replace(/\.[^.]+$/, ''), source.surface!.width, source.surface!.height)
          loaded = {
            assets: { [assetId]: source },
            document: {
              ...initialDocument,
              canvasPreset: 'custom',
              canvasSize: { width: source.surface!.width, height: source.surface!.height },
              background: { ...initialDocument.background, kind: 'transparent' },
              layers: [layer],
              selectedLayerId: layer.id,
              selectedLayerIds: [layer.id],
              fileMetadata: metadata,
            },
          }
        }
        if (pluginImporter) importWarnings.push(`Decoded through ${pluginImporter.plugin.name} · ${pluginImporter.hook.label}`)
      }
      openDocumentTab(file.name.replace(/\.[^.]+$/, ''), loaded.document, loaded.assets)
      if (importWarnings.length) {
        setNotice(`Opened ${file.name} with compatibility changes:\n• ${importWarnings.join('\n• ')}`, 'warning')
      } else {
        setNotice(`Opened ${file.name} locally.`, 'success')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice(error instanceof Error ? error.message : 'That file could not be opened.')
    } finally {
      setIsLoading(false)
    }
  }

  const requestOpen = async () => {
    const desktop = desktopBridge()
    if (!desktop) { projectInputRef.current?.click(); return }
    try { const file = await desktop.openFile(); if (file) await openFile(nativeFile(file)) } catch (error) { setNotice(error instanceof Error ? error.message : 'The native open dialog failed.') }
  }

  desktopOpenRef.current = (file) => { void openFile(nativeFile(file)) }
  desktopDropRef.current = (file) => { void openFile(file) }
  desktopCommandRef.current = (command) => {
    if (command === 'new') newDocument()
    else if (command === 'open') void requestOpen()
    else if (command === 'save') void saveProject()
    else if (command === 'undo') performUndo()
    else if (command === 'redo') performRedo()
    else if (command === 'copy-merged') {
      const canvas = canvasRef.current
      if (canvas) void desktopBridge()?.writeClipboardImage(canvas.toDataURL('image/png')).then(() => setNotice('Copied the merged composition to the system clipboard.', 'success')).catch((error) => setNotice(error instanceof Error ? error.message : 'The image could not be copied.'))
    } else if (command === 'pick-color') void desktopBridge()?.pickColor().then((color) => { if (color) { setForegroundColor(color); setTool('eyedropper'); setNotice(`Picked ${color} from the screen.`, 'success') } }).catch((error) => setNotice(error instanceof Error ? error.message : 'The screen colour could not be sampled.'))
  }

  const manageDesktopScratch = async () => {
    const desktop = desktopBridge()
    if (!desktop) return
    const requested = window.prompt('Maximum scratch storage in GB (0.25–64)', '2')
    if (requested === null) return
    const gigabytes = Number(requested)
    if (!Number.isFinite(gigabytes) || gigabytes < 0.25 || gigabytes > 64) { setNotice('Enter a scratch limit between 0.25 and 64 GB.', 'warning'); return }
    await desktop.setScratchLimit(gigabytes * 1024 ** 3)
    if (window.confirm('Clear existing Studio scratch files now? Your open document is unaffected.')) await desktop.clearScratch()
    setNotice(`Desktop scratch storage is limited to ${gigabytes} GB.`, 'success')
  }

  const newDocument = () => {
    openDocumentTab(`Untitled ${documentTabs.length + 1}`, structuredClone(initialDocument), {})
    setTool('move')
    setZoom(100)
    setNotice(null)
  }

  const switchDocumentTab = (id: string) => {
    if (id === activeTabId) return
    const tab = documentTabs.find((candidate) => candidate.id === id)
    if (!tab) return
    setDocumentTabs((current) => current.map((candidate) => candidate.id === activeTabId ? { ...candidate, history, assets } : candidate))
    setActiveTabId(id)
    historyDispatch({ type: 'restore', state: tab.history })
    setAssets(tab.assets)
    rasterUndoRef.current = []
    rasterRedoRef.current = []
    bumpRasterHistory()
    setSelection(null)
    setEditingMaskLayerId(null)
  }

  const closeDocumentTab = (id: string) => {
    if (documentTabs.length === 1) return
    const remaining = documentTabs.filter((tab) => tab.id !== id)
    setDocumentTabs(remaining)
    if (id === activeTabId) {
      const next = remaining.at(-1)!
      setActiveTabId(next.id)
      historyDispatch({ type: 'restore', state: next.history })
      setAssets(next.assets)
      setSelection(null)
    }
  }

  const duplicateDocumentTab = () => {
    openDocumentTab(`${documentTabs.find((tab) => tab.id === activeTabId)?.name ?? 'Document'} copy`, structuredClone(document), { ...assets })
  }

  const transferSelectedLayers = (targetId: string, move: boolean) => {
    if (!targetId || !selectedLayers.length) return
    const copies = selectedLayers.map((layer) => ({ ...duplicateLayer(layer), groupId: null }))
    setDocumentTabs((current) => current.map((tab) => {
      if (tab.id === activeTabId) return { ...tab, history, assets }
      if (tab.id !== targetId) return tab
      let nextHistory = tab.history
      for (const layer of copies) nextHistory = historyReducer(nextHistory, { type: 'apply', action: { type: 'add-layer', layer } })
      return { ...tab, history: nextHistory, assets: { ...tab.assets, ...assets } }
    }))
    if (move) dispatch({ type: 'remove-layers', ids: selectedLayers.map((layer) => layer.id) })
    setNotice(`${move ? 'Moved' : 'Copied'} ${copies.length} layer${copies.length === 1 ? '' : 's'} to ${documentTabs.find((tab) => tab.id === targetId)?.name ?? 'the other document'}.`, 'success')
  }

  const backgroundName = document.background.imageAssetId ? assets[document.background.imageAssetId]?.name : undefined

  const changeDocumentBitDepth = (bitDepth: 8 | 16 | 32) => {
    if (bitDepth === document.bitDepth) return
    dispatch({ type: 'set-bit-depth', bitDepth })
    setNotice(`Converted the document working precision to ${bitDepth} bits/channel.`, 'success')
  }

  const chooseColorProfile = (action: 'assign' | 'convert' | 'proof') => {
    profileActionRef.current = action
    profileInputRef.current?.click()
  }

  const loadColorProfile = async (file: File) => {
    setIsLoading(true)
    try {
      const { bakeProofProfile, inspectIccProfile } = await import('./editor/icc')
      const profile = await inspectIccProfile(new Uint8Array(await file.arrayBuffer()))
      const settings = document.colorSettings ?? { intent: 'relative' as const, blackPointCompensation: true, proofEnabled: false, gamutWarning: false }
      if (profileActionRef.current === 'proof') {
        const proofLut = await bakeProofProfile(profile, settings.intent, settings.blackPointCompensation)
        dispatch({ type: 'set-color-settings', patch: { proofProfile: profile, proofLut, proofEnabled: true } })
        setNotice(`Loaded ${profile.name} for local soft proofing.`, 'success')
      } else {
        if (profileActionRef.current === 'convert') {
          const targets = Object.entries(assetsRef.current).flatMap(([assetId, asset]) => {
            const surface = asset.surface
            const context = surface?.getContext('2d', { willReadFrequently: true })
            if (!surface || !context) return []
            const before = context.getImageData(0, 0, surface.width, surface.height)
            return [{ assetId, asset, surface, revision: asset.revision ?? 0, before }]
          })
          if (targets.length) {
            setNotice(`Converting ${targets.length} local raster asset${targets.length === 1 ? '' : 's'} to ${profile.name}… Press Escape to cancel.`, 'info')
            const worker = new Worker(new URL('./editor/workers/icc-conversion.worker.ts', import.meta.url), { type: 'module' })
            const response = await runWorkerJob<{ results?: Array<{ assetId: string; before: ArrayBuffer; after: ArrayBuffer; width: number; height: number }>; error?: string }>(
              'ICC profile conversion',
              worker,
              {
                assets: targets.map(({ assetId, before }) => ({ assetId, data: before.data.buffer, width: before.width, height: before.height })),
                source: settings.workingProfile,
                target: profile,
                intent: settings.intent,
                blackPointCompensation: settings.blackPointCompensation,
              },
              targets.map(({ before }) => before.data.buffer),
            )
            if (response.error || response.results?.length !== targets.length) throw new Error(response.error || 'ICC conversion returned incomplete pixels.')
            const results = new Map(response.results.map((result) => [result.assetId, result]))
            for (const target of targets) {
              const current = assetsRef.current[target.assetId]
              const result = results.get(target.assetId)
              if (!result || current !== target.asset || current.surface !== target.surface || (current.revision ?? 0) !== target.revision || result.width !== target.surface.width || result.height !== target.surface.height) throw new Error('A raster asset changed while its ICC conversion was running. No pixels were applied.')
              if (result.before.byteLength !== result.width * result.height * 4 || result.after.byteLength !== result.width * result.height * 4) throw new Error('ICC conversion returned invalid pixel dimensions.')
            }
            for (const target of targets) {
              const result = results.get(target.assetId)!
              const before = new ImageData(new Uint8ClampedArray(result.before), result.width, result.height)
              const after = new ImageData(new Uint8ClampedArray(result.after), result.width, result.height)
              const context = target.surface.getContext('2d', { willReadFrequently: true })!
              context.putImageData(after, 0, 0)
              refreshRasterAsset(target.assetId, { x: 0, y: 0, width: target.surface.width, height: target.surface.height })
              commitRasterEdit({ assetId: target.assetId, x: 0, y: 0, before, after })
            }
          }
        }
        dispatch({ type: 'set-color-settings', patch: { workingProfile: profile } })
        setNotice(`${profileActionRef.current === 'convert' ? 'Converted to' : 'Assigned'} ${profile.name}.`, 'success')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setNotice(error instanceof Error ? error.message : 'That ICC profile could not be loaded.')
    } finally { setIsLoading(false) }
  }

  const applyWorkspace = (workspace: WorkspacePreset) => {
    setWorkspaceLayout(normalizeWorkspaceLayout(workspace.layout))
    setNotice(`Applied the ${workspace.name} workspace.`, 'success')
  }

  const saveCurrentWorkspace = () => {
    const requestedName = window.prompt('Name this workspace')
    const name = requestedName?.trim().slice(0, 48)
    if (!name) return
    if (builtInWorkspacePresets.some((workspace) => workspace.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setNotice('Choose a different name; built-in workspace names are reserved.', 'warning')
      return
    }
    const preset = { name, layout: normalizeWorkspaceLayout(workspaceLayout) }
    setSavedWorkspaces((current) => [...current.filter((workspace) => workspace.name.toLocaleLowerCase() !== name.toLocaleLowerCase()), preset])
    setNotice(`Saved the ${name} workspace locally.`, 'success')
  }

  const deleteWorkspace = (name: string) => {
    setSavedWorkspaces((current) => current.filter((workspace) => workspace.name !== name))
    setNotice(`Deleted the ${name} workspace.`, 'success')
  }

  const runActionSteps = (steps: ActionStep[]) => {
    const actionContext = { hasSelection: Boolean(selection?.bounds), rasterLayer: selectedLayers.length === 1 && selectedLayers[0].type === 'raster', selectedLayers: selectedLayers.length }
    for (const step of steps) {
      if (!step.enabled || !actionConditionMatches(step.condition, actionContext)) continue
      if (step.command === 'new-layer') addEmptyLayer()
      else if (step.command === 'duplicate-layer') duplicateSelection()
      else if (step.command === 'invert') applyFilter({ invert: 100 })
      else if (step.command === 'grayscale') applyFilter({ grayscale: 100 })
      else if (step.command === 'blur') applyFilter({ blur: 8 })
      else if (step.command === 'sharpen') applyFilter({ contrast: 115, saturation: 108 })
      else if (step.command === 'rotate-cw') transformCanvas('rotate-cw')
      else if (step.command === 'flip-x') transformCanvas('flip-x')
      else if (step.command === 'select-all') applySelectAll()
      else if (step.command === 'deselect') setSelection(null)
    }
  }

  const exportDiagnostics = useCallback(() => {
    const report = createDiagnosticReport({
      document,
      renderer: rendererCapabilities.activeRenderer,
      rendererState: rendererCapabilities.typegpu.state,
      assetCount: Object.keys(assets).length,
      pluginCount: plugins.length,
      recovery: { state: saveStatus === 'saved' ? 'saved' : saveStatus, savedAt: recoverySavedAt },
    })
    downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `studio-diagnostics-${new Date().toISOString().slice(0, 10)}.json`)
    setNotice('Exported a privacy-safe diagnostic report.', 'success')
  }, [assets, document, plugins.length, recoverySavedAt, rendererCapabilities.activeRenderer, rendererCapabilities.typegpu.state, saveStatus, setNotice])

  const paletteCommands: PaletteCommand[] = (() => {
    const labelFor = (id: string) => shortcutLabel(shortcuts[id] ?? '')
    const commands: PaletteCommand[] = [
      { id: 'new', label: 'New document', category: 'File', shortcut: labelFor('file.new'), run: newDocument },
      { id: 'open', label: 'Open file…', category: 'File', shortcut: labelFor('file.open'), run: () => projectInputRef.current?.click() },
      { id: 'save', label: 'Save Studio project', category: 'File', shortcut: labelFor('file.save'), disabled: isProjectSaving, run: () => void saveProject() },
      { id: 'export-png', label: 'Export PNG', category: 'Export', keywords: 'save image', run: () => void exportImage('png') },
      { id: 'export-psd', label: 'Export layered PSD', category: 'Export', keywords: 'photoshop', run: () => void exportImage('psd') },
      { id: 'undo', label: 'Undo', category: 'Edit', shortcut: labelFor('edit.undo'), disabled: history.past.length === 0 && rasterUndoRef.current.length === 0, run: performUndo },
      { id: 'redo', label: 'Redo', category: 'Edit', shortcut: labelFor('edit.redo'), disabled: history.future.length === 0 && rasterRedoRef.current.length === 0, run: performRedo },
      { id: 'new-layer', label: 'New empty layer', category: 'Layer', shortcut: labelFor('layer.new'), run: addEmptyLayer },
      { id: 'new-group', label: 'New layer group', category: 'Layer', keywords: 'folder', run: addLayerGroup },
      { id: 'duplicate', label: 'Duplicate selected layer or group', category: 'Layer', shortcut: labelFor('layer.duplicate'), disabled: !selectedGroup && selectedLayers.length === 0, run: duplicateSelection },
      { id: 'select-all', label: 'Select all pixels', category: 'Select', shortcut: '⌘A', run: applySelectAll },
      { id: 'deselect', label: 'Deselect pixels', category: 'Select', shortcut: '⌘D', disabled: !selection?.bounds, run: () => setSelection(null) },
      { id: 'filter-blur', label: 'Gaussian blur', category: 'Filter', disabled: selectedLayers.length === 0, run: () => applyFilter({ blur: 8 }) },
      { id: 'filter-sharpen', label: 'Sharpen', category: 'Filter', disabled: selectedLayers.length === 0, run: () => applyFilter({ contrast: 115, saturation: 108 }) },
      { id: 'zoom-in', label: 'Zoom in', category: 'View', shortcut: labelFor('view.zoom-in'), run: () => setZoom((value) => Math.min(250, value + 25)) },
      { id: 'zoom-out', label: 'Zoom out', category: 'View', shortcut: labelFor('view.zoom-out'), run: () => setZoom((value) => Math.max(25, value - 25)) },
      { id: 'zoom-actual', label: '100% actual pixels', category: 'View', shortcut: labelFor('view.actual'), run: () => setZoom(100) },
      { id: 'shortcuts', label: 'Edit keyboard shortcuts…', category: 'Edit', keywords: 'keys bindings', run: () => setEditingShortcuts(true) },
      { id: 'help', label: 'Contextual help…', category: 'Help', shortcut: 'F1', run: () => setContextualHelpOpen(true) },
      { id: 'diagnostics', label: 'Export diagnostics…', category: 'Help', run: exportDiagnostics },
    ]
    for (const command of shortcutCommands.filter((candidate) => candidate.category === 'Tools')) {
      const editorTool = command.id.slice(5) as EditorTool
      commands.push({ id: command.id, label: `${command.label} tool`, category: 'Tools', shortcut: labelFor(command.id), run: () => setTool(editorTool) })
    }
    return commands
  })()

  return (
    <div className="studio-editor min-h-screen bg-[#0b0b0c] text-zinc-100">
      <header className="flex h-12 items-center justify-between border-b border-white/[0.07] bg-[#0e0e10] px-2.5 sm:px-3">
        <div className="flex h-full items-center gap-2.5">
          <button type="button" aria-label={onExit ? 'Back to Studio home' : 'Studio'} title={onExit ? 'Back to Studio home' : undefined} onClick={onExit} className={`flex items-center rounded-lg text-left ${onExit ? 'focus-visible:outline-2 focus-visible:outline-violet-400' : 'cursor-default'}`}>
            <span className="relative flex size-7 items-center justify-center overflow-hidden rounded-md bg-violet-500 shadow-[0_0_20px_rgba(139,92,246,0.22)]">
              <span className="absolute -top-3 -left-2 size-7 rounded-full bg-fuchsia-400/80 blur-[5px]" />
              <span className="absolute -right-2 -bottom-3 size-8 rounded-full bg-cyan-300/70 blur-[6px]" />
              <span className="relative text-[10px] font-black tracking-tighter text-white">S</span>
            </span>
          </button>
          <MenuBar
            onNew={newDocument}
            onOpen={() => void requestOpen()}
            onSave={() => void saveProject()}
            onAddImage={() => imageInputRef.current?.click()}
            onPlaceLinkedSmartObject={() => linkedSmartObjectInputRef.current?.click()}
            onLoadFont={() => fontInputRef.current?.click()}
            onLoadBrush={() => brushInputRef.current?.click()}
            onExport={(format) => void exportImage(format)}
            onExportArtboards={() => void exportArtboards()}
            onOpenExportWorkspace={() => setExportWorkspaceOpen(true)}
            onOpenPrint={() => setPrintDialogOpen(true)}
            desktopAvailable={Boolean(desktopBridge())}
            onManageScratch={() => void manageDesktopScratch()}
            onUndo={performUndo}
            onRedo={performRedo}
            onTransformAgain={() => { if (lastGeometryTransform) dispatch({ type: 'update-layers', changes: selectedLayers.filter((layer) => layer.type !== 'adjustment').map((layer) => ({ id: layer.id, patch: { geometryTransform: structuredClone(lastGeometryTransform) } })) }) }}
            shortcuts={shortcuts}
            onEditShortcuts={() => setEditingShortcuts(true)}
            onOpenScripts={() => setEditingScripts(true)}
            onOpenPlugins={() => setEditingPlugins(true)}
            onOpenCommands={() => setCommandPaletteOpen(true)}
            onOpenHelp={() => setContextualHelpOpen(true)}
            onExportDiagnostics={exportDiagnostics}
            onToggleTimeline={() => setTimelineOpen((value) => !value)}
            pluginExporters={plugins.flatMap((plugin) => plugin.hooks.exporters.map((hook) => ({ ...hook, pluginId: plugin.id })))}
            onPluginExport={(hook) => void exportImage(hook.format)}
            pluginFilters={plugins.flatMap((plugin) => plugin.hooks.filters.map((hook) => ({ ...hook, pluginId: plugin.id })))}
            onPluginFilter={applyPluginFilter}
            onContentAwareFill={() => void contentAwareFillSelection()}
            onRotateCanvas={(direction) => transformCanvas(direction === 'cw' ? 'rotate-cw' : 'rotate-ccw')}
            onFlipCanvas={(axis) => transformCanvas(axis === 'x' ? 'flip-x' : 'flip-y')}
            onNewLayer={addEmptyLayer}
            onNewGroup={addLayerGroup}
            onDuplicateLayer={duplicateSelection}
            onRasterizeLayer={rasterizeSelectedLayer}
            onConvertToSmartObject={convertSelectedToSmartObject}
            onReplaceSmartObject={() => replaceSmartObjectInputRef.current?.click()}
            onRelinkSmartObject={() => relinkSmartObjectInputRef.current?.click()}
            onExportSmartObject={() => void exportSmartObjectContents()}
            onClearLayerEffects={() => dispatch({ type: 'update-layers', changes: selectedLayers.filter((layer) => layer.type !== 'adjustment').map((layer) => ({ id: layer.id, patch: { effects: null } })) })}
            onDeleteLayer={deleteSelection}
            onSelectAll={applySelectAll}
            onDeselect={() => setSelection(null)}
            onInvertSelection={() => applySelectionOperation('invert')}
            onFeatherSelection={() => applySelectionOperation('feather')}
            onExpandSelection={() => applySelectionOperation('expand')}
            onContractSelection={() => applySelectionOperation('contract')}
            onColorRange={selectColorRange}
            onLuminosityRange={selectLuminosityRange}
            onEdgeSelection={selectEdges}
            onGrowSelection={() => growOrSelectSimilar('grow')}
            onSimilarSelection={() => growOrSelectSimilar('similar')}
            onSelectAndMask={() => { if (selection) setSelectionWorkspaceSource(cloneSelection(selection)) }}
            onFilter={(preset) => {
              if (preset === 'blur') applyFilter({ blur: 8 })
              else if (preset === 'sharpen') applyFilter({ contrast: 115, saturation: 108 })
              else if (preset === 'grayscale') applyFilter({ grayscale: 100 })
              else if (preset === 'sepia') applyFilter({ sepia: 100 })
              else if (preset === 'invert') applyFilter({ invert: 100 })
              else resetFilters()
            }}
            onZoom={(command) => setZoom((current) => command === 'actual' ? 100 : Math.max(25, Math.min(250, current + (command === 'in' ? 25 : -25))))}
            onTogglePanel={(panel) => setWorkspaceLayout((current) => ({ ...current, collapsedPanels: { ...current.collapsedPanels, [panel]: !current.collapsedPanels[panel] } }))}
            onApplyWorkspace={applyWorkspace}
            onSaveWorkspace={saveCurrentWorkspace}
            onDeleteWorkspace={deleteWorkspace}
            workspacePresets={[...builtInWorkspacePresets, ...savedWorkspaces]}
            propertiesPanelVisible={!workspaceLayout.collapsedPanels.properties}
            layersPanelVisible={!workspaceLayout.collapsedPanels.layers}
            timelineVisible={timelineOpen}
            canUndo={history.past.length > 0 || rasterUndoRef.current.length > 0}
            canRedo={history.future.length > 0 || rasterRedoRef.current.length > 0}
            canTransformAgain={Boolean(lastGeometryTransform && selectedLayers.some((layer) => layer.type !== 'adjustment'))}
            canContentAwareFill={Boolean(selection?.bounds && selectedLayers.length === 1 && selectedLayers[0].type === 'raster' && !layerIsLocked(document, selectedLayers[0]))}
            hasLayerSelection={Boolean(selectedGroup || selectedLayers.length)}
            canRasterize={selectedLayers.length === 1 && !['raster', 'adjustment'].includes(selectedLayers[0].type)}
            canConvertToSmartObject={selectedLayers.length === 1 && !['adjustment', 'smart-object'].includes(selectedLayers[0].type)}
            smartObjectKind={selectedLayers.length === 1 && selectedLayers[0].type === 'smart-object' ? selectedLayers[0].source.kind : undefined}
            hasLayerEffects={selectedLayers.some((layer) => hasEnabledLayerEffects(layer.effects))}
            hasPixelSelection={Boolean(selection?.bounds)}
            hasFilterTarget={selectedLayers.some((layer) => layer.type !== 'adjustment' && !layerIsLocked(document, layer))}
            saving={isProjectSaving}
            exporting={isExporting}
            hasArtboards={Boolean(document.artboards?.length)}
          />
        </div>

        <div className="hidden items-center gap-3 text-[9px] font-medium text-zinc-700 sm:flex">
          <span
            className="text-zinc-600"
            title={rendererCapabilities.typegpu.state === 'unavailable' || rendererCapabilities.typegpu.state === 'lost' ? rendererCapabilities.typegpu.reason : rendererCapabilities.activeRenderer === 'webgpu' ? 'TypeGPU is compositing this document from native per-layer textures.' : 'This document uses composition features that currently require the Canvas2D compatibility renderer.'}
          >
            {rendererCapabilities.activeRenderer === 'webgpu' ? 'TypeGPU · native layers' : `Canvas2D · ${rendererCapabilities.typegpu.state === 'ready' ? 'compatibility' : rendererCapabilities.typegpu.state === 'initializing' ? 'Checking WebGPU…' : 'WebGPU fallback'}`}
          </span>
          <span className="flex items-center gap-2"><span className={`size-1.5 rounded-full ${saveStatus === 'saving' ? 'bg-amber-400' : saveStatus === 'saved' ? 'bg-emerald-400/70' : 'bg-zinc-700'}`} /><span>{saveStatus === 'saving' ? 'Saving locally…' : saveStatus === 'saved' ? 'Saved locally' : 'Local only'}</span></span>
        </div>
      </header>

      <nav aria-label="Open documents" className="flex h-9 items-stretch border-b border-white/[0.07] bg-[#101012]">
        <div className="studio-tab-strip flex min-w-0 flex-1 overflow-x-auto">
          {documentTabs.map((tab) => (
            <div key={tab.id} className={`group flex min-w-36 max-w-56 items-center border-r border-white/[0.07] ${tab.id === activeTabId ? 'bg-[#1b1b1f] text-zinc-100' : 'bg-[#121214] text-zinc-500 hover:bg-[#171719] hover:text-zinc-300'}`}>
              <button type="button" onClick={() => switchDocumentTab(tab.id)} className="min-w-0 flex-1 truncate px-3 text-left text-[11px]" title={tab.name}>{tab.name}</button>
              {documentTabs.length > 1 && <button type="button" onClick={() => closeDocumentTab(tab.id)} aria-label={`Close ${tab.name}`} title="Close document" className="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-sm text-zinc-600 opacity-0 hover:bg-white/[0.08] hover:text-zinc-200 group-hover:opacity-100 group-focus-within:opacity-100">×</button>}
            </div>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1 border-l border-white/[0.07] px-1.5">
          {documentTabs.length > 1 && selectedLayers.length > 0 && <>
            <select aria-label="Layer transfer document" value={layerTransferTarget} onChange={(event) => setLayerTransferTarget(event.target.value)} className="h-6 max-w-36 rounded border border-white/[0.08] bg-[#19191c] px-1.5 text-[10px] text-zinc-400">
              {documentTabs.filter((tab) => tab.id !== activeTabId).map((tab) => <option key={tab.id} value={tab.id}>{tab.name}</option>)}
            </select>
            <button type="button" onClick={() => transferSelectedLayers(layerTransferTarget, false)} className="rounded px-2 py-1 text-[10px] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200">Copy layer</button>
            <button type="button" onClick={() => transferSelectedLayers(layerTransferTarget, true)} className="rounded px-2 py-1 text-[10px] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200">Move layer</button>
          </>}
          <button type="button" onClick={duplicateDocumentTab} aria-label="Duplicate document" title="Duplicate document" className="flex size-6 items-center justify-center rounded text-xs text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200">⧉</button>
          <button type="button" onClick={newDocument} aria-label="New document" title="New document" className="flex size-6 items-center justify-center rounded text-base text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200">+</button>
        </div>
      </nav>

      {smartObjectSessions.length > 0 && <div className="flex h-10 items-center justify-between border-b border-cyan-300/15 bg-cyan-300/[0.06] px-4 text-[11px]"><span className="text-cyan-100">Editing smart object · {smartObjectSessions.at(-1)?.name}</span><span className="flex gap-2"><button type="button" onClick={() => closeSmartObjectContents(false)} className="rounded-md px-3 py-1 text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200">Cancel</button><button type="button" onClick={() => closeSmartObjectContents(true)} className="rounded-md bg-cyan-300/15 px-3 py-1 font-medium text-cyan-100 hover:bg-cyan-300/20">Save contents & return</button></span></div>}

      <main className="flex flex-col lg:flex-row">
        <ToolRail tool={tool} onChange={setTool} shortcuts={shortcuts} pluginTools={plugins.flatMap((plugin) => plugin.hooks.tools.map((hook) => ({ ...hook, pluginId: plugin.id })))} />
        <Inspector document={document} dispatch={dispatch} endHistoryGroup={endHistoryGroup} onBackgroundImage={() => backgroundInputRef.current?.click()} backgroundImageName={backgroundName} customFonts={customFonts} onLoadFont={() => fontInputRef.current?.click()} onOpenSmartObject={openSmartObjectContents} onReplaceSmartObject={() => replaceSmartObjectInputRef.current?.click()} onRelinkSmartObject={() => relinkSmartObjectInputRef.current?.click()} onExportSmartObject={() => void exportSmartObjectContents()} onContentAwareScale={(layerId, width, height) => void contentAwareScaleLayer(layerId, width, height)} canvasRef={canvasRef} renderer={rendererCapabilities.activeRenderer} onBitDepthChange={changeDocumentBitDepth} onChooseColorProfile={chooseColorProfile} dockSide={workspaceLayout.propertiesOnLeft ? 'left' : 'right'} onSwapPanels={() => setWorkspaceLayout((current) => ({ ...current, propertiesOnLeft: !current.propertiesOnLeft }))} width={workspaceLayout.panelWidths.properties} onWidthChange={(width) => setWorkspaceLayout((current) => ({ ...current, panelWidths: { ...current.panelWidths, properties: width } }))} collapsed={workspaceLayout.collapsedPanels.properties} onToggleCollapsed={() => setWorkspaceLayout((current) => ({ ...current, collapsedPanels: { ...current.collapsedPanels, properties: !current.collapsedPanels.properties } }))} />
        <CanvasStage canvasRef={canvasRef} document={document} assets={assets} dispatch={dispatch} endHistoryGroup={endHistoryGroup} isLoading={isLoading} onFile={(file) => void addImageFile(file)} canUndo={history.past.length > 0 || rasterUndoRef.current.length > 0} canRedo={history.future.length > 0 || rasterRedoRef.current.length > 0} onUndo={performUndo} onRedo={performRedo} onAlign={alignSelection} onRasterChange={refreshRasterAsset} onRasterCommit={commitRasterEdit} editingMaskLayerId={editingMaskLayerId} selection={selection} onSelectionChange={setSelection} zoom={zoom} onZoomChange={setZoom} tool={tool} shortcuts={shortcuts} onToolChange={setTool} onAddText={addTextAt} onAddShape={addShapeAt} onCrop={cropDocument} onPerspectiveCrop={perspectiveCropDocument} brushes={[roundBrush, ...customBrushes]} brushId={brushId} onBrushChange={setBrushId} onLoadBrush={() => brushInputRef.current?.click()} foregroundColor={foregroundColor} backgroundColor={backgroundColor} gradientStops={activeGradientStops} onForegroundColorChange={(color) => setForegroundColor(normalizeHexColor(color, foregroundColor))} onBackgroundColorChange={(color) => setBackgroundColor(normalizeHexColor(color, backgroundColor))} />
        <LayersPanel document={document} dispatch={dispatch} onAddLayer={addEmptyLayer} onAddAdjustment={addAdjustment} onAddGroup={addLayerGroup} editingMaskLayerId={editingMaskLayerId} onAddMask={addLayerMask} onEditMask={editLayerMask} onRemoveMask={removeLayerMask} dockSide={workspaceLayout.propertiesOnLeft ? 'right' : 'left'} onSwapPanels={() => setWorkspaceLayout((current) => ({ ...current, propertiesOnLeft: !current.propertiesOnLeft }))} width={workspaceLayout.panelWidths.layers} onWidthChange={(width) => setWorkspaceLayout((current) => ({ ...current, panelWidths: { ...current.panelWidths, layers: width } }))} collapsed={workspaceLayout.collapsedPanels.layers} onToggleCollapsed={() => setWorkspaceLayout((current) => ({ ...current, collapsedPanels: { ...current.collapsedPanels, layers: !current.collapsedPanels.layers } }))} activePanel={workspaceLayout.activeUtilityPanel} onActivePanelChange={(activeUtilityPanel) => setWorkspaceLayout((current) => ({ ...current, activeUtilityPanel }))} assets={assets} canvasRef={canvasRef} selection={selection} onLoadComponentChannel={loadComponentChannel} onSaveAlphaChannel={saveAlphaChannel} onLoadAlphaChannel={loadAlphaChannel} onDuplicateAlphaChannel={duplicateAlphaChannel} onDeleteAlphaChannel={deleteAlphaChannel} onTransformAlphaChannel={transformAlphaChannel} onFillPath={(path) => addPathShape(path, 'fill')} onStrokePath={(path) => addPathShape(path, 'stroke')} customShapes={customShapes} onSaveCustomShape={saveCustomShape} onApplyCustomShape={applyCustomShape} onRemoveCustomShape={(id) => setCustomShapes((current) => current.filter((shape) => shape.id !== id))} onImportCustomShape={() => shapeInputRef.current?.click()} onExportPath={exportDocumentPath} zoom={zoom} onZoomChange={setZoom} renderer={rendererCapabilities.activeRenderer} historyPast={history.past} historyFuture={history.future} rasterUndoDepth={rasterUndoRef.current.length} onJumpHistory={jumpDocumentHistory} renderRevision={resourceRevision + Object.values(assets).reduce((total, asset) => total + (asset.revision ?? 0), 0)} panelOrder={workspaceLayout.utilityPanelOrder} onPanelOrderChange={(moved, before) => setWorkspaceLayout((current) => ({ ...current, utilityPanelOrder: reorderUtilityPanels(current.utilityPanelOrder, moved, before) }))} floating={workspaceLayout.utilityPanelFloating} floatingPosition={workspaceLayout.floatingPanelPosition} onFloatingPositionChange={(floatingPanelPosition) => setWorkspaceLayout((current) => ({ ...current, floatingPanelPosition }))} onToggleFloating={() => setWorkspaceLayout((current) => ({ ...current, utilityPanelFloating: !current.utilityPanelFloating, collapsedPanels: { ...current.collapsedPanels, layers: false } }))} secondaryPanel={workspaceLayout.secondaryUtilityPanel} onSecondaryPanelChange={(secondaryUtilityPanel) => setWorkspaceLayout((current) => ({ ...current, secondaryUtilityPanel }))} secondaryHeight={workspaceLayout.secondaryPanelHeight} onSecondaryHeightChange={(secondaryPanelHeight) => setWorkspaceLayout((current) => ({ ...current, secondaryPanelHeight }))} secondaryFloating={workspaceLayout.secondaryUtilityPanelFloating} onToggleSecondaryFloating={() => setWorkspaceLayout((current) => ({ ...current, secondaryUtilityPanelFloating: !current.secondaryUtilityPanelFloating }))} secondaryFloatingPosition={workspaceLayout.secondaryFloatingPanelPosition} onSecondaryFloatingPositionChange={(secondaryFloatingPanelPosition) => setWorkspaceLayout((current) => ({ ...current, secondaryFloatingPanelPosition }))} onRunActions={runActionSteps} plugins={plugins} foregroundColor={foregroundColor} backgroundColor={backgroundColor} customSwatches={customSwatches} onForegroundColorChange={(color) => setForegroundColor(normalizeHexColor(color, foregroundColor))} onBackgroundColorChange={(color) => setBackgroundColor(normalizeHexColor(color, backgroundColor))} onAddSwatch={(color) => setCustomSwatches((current) => normalizeCustomSwatches([...current, color]))} onRemoveSwatch={(color) => setCustomSwatches((current) => current.filter((swatch) => swatch !== color))} customGradients={customGradients} onApplyGradient={(gradient) => { setActiveGradientStops(normalizeGradientStops(gradient.stops, gradient.start, gradient.end)); setForegroundColor(gradient.start); setBackgroundColor(gradient.end); setTool('gradient') }} onAddGradient={(name, stops) => setCustomGradients((current) => normalizeCustomGradients([...current, { id: createId(), name, stops, start: stops[0].color, end: stops.at(-1)!.color }]))} onRemoveGradient={(id) => setCustomGradients((current) => current.filter((gradient) => gradient.id !== id))} customPatterns={customPatterns} onApplyPattern={(pattern) => dispatch({ type: 'set-pattern', patch: pattern })} onAddPattern={(name, pattern) => setCustomPatterns((current) => normalizeCustomPatterns([...current, { id: createId(), name, ...pattern }]))} onRemovePattern={(id) => setCustomPatterns((current) => current.filter((pattern) => pattern.id !== id))} onImportPattern={() => patternInputRef.current?.click()} onExportPattern={exportPatternFromLibrary} brushes={[roundBrush, ...customBrushes]} brushId={brushId} customFonts={customFonts} onBrushChange={(id) => { setBrushId(id); setTool('brush') }} onLoadBrush={() => brushInputRef.current?.click()} onRemoveBrush={(id) => void removeBrushFromLibrary(id)} onExportBrush={(brush) => void exportBrushFromLibrary(brush)} onLoadFont={() => fontInputRef.current?.click()} onRemoveFont={(id) => void removeFontFromLibrary(id)} />
      </main>

      <input ref={imageInputRef} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp,image/avif,image/x-icon" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addImageFile(file); event.target.value = '' }} />
      <input ref={linkedSmartObjectInputRef} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addLinkedSmartObjectFile(file); event.target.value = '' }} />
      <input ref={replaceSmartObjectInputRef} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void replaceSmartObjectSource(file, 'embedded'); event.target.value = '' }} />
      <input ref={relinkSmartObjectInputRef} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void replaceSmartObjectSource(file, 'linked'); event.target.value = '' }} />
      <input ref={backgroundInputRef} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void setBackgroundFile(file); event.target.value = '' }} />
      <input ref={projectInputRef} type="file" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void openFile(file); event.target.value = '' }} />
      <input ref={fontInputRef} type="file" className="sr-only" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadFontFile(file); event.target.value = '' }} />
      <input ref={brushInputRef} type="file" className="sr-only" accept=".abr,.studio-brush,.json,image/png,image/jpeg,image/webp,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadBrushFile(file); event.target.value = '' }} />
      <input ref={shapeInputRef} type="file" className="sr-only" accept=".studio-shape,application/json,application/x-studio-shape+json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadCustomShapeFile(file); event.target.value = '' }} />
      <input ref={patternInputRef} type="file" className="sr-only" accept=".studio-pattern,image/png,image/jpeg,image/webp,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadPatternFile(file); event.target.value = '' }} />
      <input ref={profileInputRef} type="file" className="sr-only" accept=".icc,.icm,application/vnd.iccprofile" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadColorProfile(file); event.target.value = '' }} />

      {notice && <Toast value={notice} onDismiss={() => setNotice(null)} />}
      {selectionWorkspaceSource && <SelectAndMaskWorkspace source={selectionWorkspaceSource} onPreview={setSelection} onApply={() => setSelectionWorkspaceSource(null)} onCancel={() => { setSelection(cloneSelection(selectionWorkspaceSource)); setSelectionWorkspaceSource(null) }} />}
      {editingShortcuts && <ShortcutEditor value={shortcuts} onChange={setShortcuts} onClose={() => setEditingShortcuts(false)} />}
      {editingScripts && <ScriptSandboxDialog document={document} onClose={() => setEditingScripts(false)} />}
      {editingPlugins && <PluginManagerDialog plugins={plugins} onChange={setPlugins} onClose={() => setEditingPlugins(false)} />}
      {commandPaletteOpen && <CommandPalette commands={paletteCommands} onClose={() => setCommandPaletteOpen(false)} />}
      {contextualHelpOpen && <ContextualHelpDialog tool={tool} selectedLayerType={selectedLayers.length === 1 ? selectedLayers[0].type : undefined} onClose={() => setContextualHelpOpen(false)} />}
      {timelineOpen && <AnimationTimeline document={document} preview={animationPreview} onPreview={setAnimationPreview} onChange={(animation) => dispatch({ type: 'set-animation', animation })} onClose={() => setTimelineOpen(false)} />}
      {exportWorkspaceOpen && <ExportWorkspace slices={document.slices ?? []} metadata={document.fileMetadata ?? {}} selection={selection?.bounds ?? null} layerCount={document.layers.length} artboardCount={document.artboards?.length ?? 0} onSlicesChange={(slices) => dispatch({ type: 'set-slices', slices })} onMetadataChange={(metadata) => dispatch({ type: 'set-file-metadata', metadata })} onExport={(settings) => void exportGeneratedAssets(settings)} onClose={() => setExportWorkspaceOpen(false)} />}
      {printDialogOpen && <PrintDialog canvasSize={document.canvasSize} metadata={document.fileMetadata ?? {}} value={document.printSettings ?? (() => { const dpi = document.fileMetadata?.resolutionDpi ?? 300; return { widthInches: document.canvasSize.width / dpi, heightInches: document.canvasSize.height / dpi, dpi, bleedInches: 0.125, cropMarks: true, center: true } })()} onChange={(settings) => dispatch({ type: 'set-print-settings', settings })} onExport={() => void createPrintPdf(false)} onPrint={() => void createPrintPdf(true)} onClose={() => setPrintDialogOpen(false)} />}
    </div>
  )
}

export default App
