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
import { cloneRasterSource, createEmptyRasterSource, createLayerMaskSource, createRasterSurface, loadImageFile, surfaceToBlob } from './editor/image'
import { createAdjustmentLayer, createId, createImageLayer, createLayerGroup, createRasterLayer, createShapeLayer, createSmartObjectLayer, createTextLayer, duplicateLayer, getDocumentSize, initialDocument } from './editor/presets'
import { loadRecoveryProject, parseProjectFile, saveRecoveryProject, serializeProject } from './editor/project'
import { calculateImageRect, getLayerBounds } from './editor/renderer'
import { canvas2dCompositionRenderer } from './editor/rendering/composition-renderer'
import { useRendererCapabilities } from './editor/rendering/use-renderer-capabilities'
import type { AssetMap } from './editor/runtime-assets'
import { getDescendantGroupIds, groupIsLocked, layerIsLocked } from './editor/stack'
import { smartObjectBytesHash, smartObjectDocumentHash } from './editor/smart-objects'
import type { RasterEdit, RasterRegion } from './editor/raster'
import type { DocumentChannel, DocumentPath, EditorDispatch, EditorLayer, HistoryState, LayerFilters, LayerGeometryTransform, LayerPatch, Position, ShapeKind } from './editor/types'
import { applySelectionAlphaMask, colorRangeMask, componentChannelMask, edgeSelectionMask, featherSelection, growSelectionMask, invertSelection, luminosityRangeMask, morphSelection, selectAll, similarSelectionMask, type ComponentChannel, type SelectionBounds, type SelectionMode, type SelectionState } from './editor/selection'
import { useCanvasRenderer } from './editor/use-canvas-renderer'
import { importBrush, importFont, loadBrushLibrary, loadFontLibrary, removeBrush, roundBrush, type BrushPreset, type CustomFontResource } from './editor/resources'
import { Toast, type ToastMessage, type ToastTone } from './components/Toast'
import { SelectAndMaskWorkspace } from './components/SelectAndMaskWorkspace'
import { cloneSelection } from './editor/selection'
import { builtInWorkspacePresets, defaultWorkspaceLayout, normalizeWorkspaceLayout, reorderUtilityPanels, type WorkspaceLayout, type WorkspacePreset } from './editor/panel-layout'
import { normalizeCustomSwatches, normalizeHexColor } from './editor/swatches'
import { normalizeCustomGradients, type GradientPreset } from './editor/gradients'
import { normalizeCustomPatterns, type PatternPreset } from './editor/patterns'
import type { AlphaChannelTransform } from './components/UtilityPanels'
import { normalizeCustomShapes, parseCustomShapeFile, serializeCustomShape, type CustomShapePreset } from './editor/shape-library'
import { perspectiveCropPixels } from './editor/transform'

type ExportFormat = 'png' | 'jpeg' | 'webp' | 'svg' | 'psd'
type Alignment = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom'

type AppProps = { onExit?: () => void }
type DocumentTab = { id: string; name: string; history: HistoryState; assets: AssetMap }

function App({ onExit }: AppProps) {
  const [history, historyDispatch] = useReducer(historyReducer, initialHistoryState)
  const initialTabId = useRef<string>(createId()).current
  const [documentTabs, setDocumentTabs] = useState<DocumentTab[]>(() => [{ id: initialTabId, name: 'Untitled', history: structuredClone(initialHistoryState), assets: {} }])
  const documentTabsRef = useRef(documentTabs)
  const [activeTabId, setActiveTabId] = useState<string>(initialTabId)
  const [layerTransferTarget, setLayerTransferTarget] = useState('')
  const [, bumpRasterHistory] = useReducer((value: number) => value + 1, 0)
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [selectionWorkspaceSource, setSelectionWorkspaceSource] = useState<SelectionState | null>(null)
  const [assets, setAssets] = useState<AssetMap>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [notice, setNoticeState] = useState<ToastMessage | null>(null)
  const setNotice = useCallback((message: string | null, tone: ToastTone = 'error') => setNoticeState(message ? { message, tone } : null), [])
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [isProjectSaving, setIsProjectSaving] = useState(false)
  const [editingMaskLayerId, setEditingMaskLayerId] = useState<string | null>(null)
  const [tool, setTool] = useState<EditorTool>('move')
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
  const hydratedRef = useRef(false)
  const rasterUndoRef = useRef<Array<RasterEdit & { depth: number }>>([])
  const rasterRedoRef = useRef<Array<RasterEdit & { depth: number }>>([])
  const assetsRef = useRef(assets)
  const document = history.present
  const rendererCapabilities = useRendererCapabilities(document)

  assetsRef.current = assets
  documentTabsRef.current = documentTabs
  useCanvasRenderer(canvasRef, document, assets, resourceRevision, rendererCapabilities.activeRenderer)

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
  }, [setNotice])

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
      const brush = await importBrush(file)
      setCustomBrushes((current) => [...current.filter((candidate) => candidate.id !== brush.id), brush])
      setBrushId(brush.id)
      setTool('brush')
      setNotice(`Loaded ${brush.name} and selected it for painting.`, 'success')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That brush could not be loaded.')
    }
  }, [setNotice])

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
          setNotice('Recovered your locally autosaved project.', 'info')
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
    if (!hydratedRef.current || isLoading) return
    setSaveStatus('saving')
    const timer = window.setTimeout(() => {
      saveRecoveryProject(document, assets)
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('idle'))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [assets, document, isLoading])

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
      return { ...current, [assetId]: { ...asset, revision, dirtyRegions } }
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

  const addTextAt = (position: Position, color: string) => {
    const layer = createTextLayer(document.layers.filter((candidate) => candidate.type === 'text').length + 1)
    layer.position = position
    layer.color = color
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
      const output = await new Promise<{ data: ArrayBuffer; width: number; height: number }>((resolve, reject) => {
        worker.onmessage = (event) => resolve(event.data as { data: ArrayBuffer; width: number; height: number })
        worker.onerror = () => reject(new Error('The local seam-carving worker stopped unexpectedly.'))
        worker.postMessage({ data: input.data.buffer, width: input.width, height: input.height, targetWidth, targetHeight }, [input.data.buffer])
      }).finally(() => worker.terminate())
      const assetId = createId()
      const source = createEmptyRasterSource(output.width, output.height, `${layer.name} content-aware pixels`)
      source.surface?.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(output.data), output.width, output.height), 0, 0)
      setAssets((current) => ({ ...current, [assetId]: source }))
      dispatch({ type: 'update-layer', id: layer.id, patch: { assetId, width: output.width, height: output.height, scale: 100 } })
      setNotice(`Content-aware scaled ${layer.name} to ${output.width} × ${output.height}px.`, 'success')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Content-aware scale could not finish.')
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
      if (layer.embeddedDocument) {
        const json = await serializeProject(layer.embeddedDocument, assets)
        downloadBlob(new Blob([json], { type: 'application/x-studio+json' }), layer.source.fileName.replace(/\.[^.]+$/, '') + '.studio')
        return
      }
      const source = assets[layer.assetId]
      const blob = source?.blob ?? (source?.surface ? await surfaceToBlob(source.surface) : undefined)
      if (!blob) throw new Error('This smart object does not have exportable local contents.')
      downloadBlob(blob, layer.source.fileName)
    } catch (error) {
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
    if (format === 'psd') {
      try {
        const { exportPsdDocument } = await import('./editor/psd')
        const blob = await exportPsdDocument(document, assets)
        downloadBlob(blob, 'studio-composition.psd')
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'The layered PSD could not be created.')
      } finally {
        setIsExporting(false)
      }
      return
    }
    const exportCanvas = window.document.createElement('canvas')
    canvas2dCompositionRenderer.render(exportCanvas, { ...document, selectedLayerId: null }, assets)
    const mime = `image/${format}`
    exportCanvas.toBlob((blob) => {
      if (!blob) {
        setNotice(`The ${format.toUpperCase()} could not be created.`)
        setIsExporting(false)
        return
      }
      downloadBlob(blob, `studio-composition.${format === 'jpeg' ? 'jpg' : format}`)
      setIsExporting(false)
    }, mime, format === 'png' ? undefined : 0.92)
  }

  const saveProject = async () => {
    setIsProjectSaving(true)
    setNotice(null)
    try {
      const json = await serializeProject(document, assets)
      downloadBlob(new Blob([json], { type: 'application/x-studio+json' }), 'untitled.studio')
    } catch (error) {
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
      const loaded = await parseProjectFile(file)
      openDocumentTab(file.name.replace(/\.studio$/i, ''), loaded.document, loaded.assets)
      setNotice(`Opened ${file.name} entirely in your browser.`, 'success')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The project could not be opened.')
    } finally {
      setIsLoading(false)
    }
  }

  const openFile = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase()
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
        const imported = await importPsdFile(file)
        loaded = imported
        importWarnings = imported.warnings
      } else if (extension === 'svg' || file.type === 'image/svg+xml') {
        const { importSvgFile } = await import('./editor/svg')
        loaded = await importSvgFile(file)
      } else {
        const source = createRasterSurface(await loadImageFile(file))
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
          },
        }
      }
      openDocumentTab(file.name.replace(/\.[^.]+$/, ''), loaded.document, loaded.assets)
      if (importWarnings.length) {
        setNotice(`Opened ${file.name} with compatibility changes:\n• ${importWarnings.join('\n• ')}`, 'warning')
      } else {
        setNotice(`Opened ${file.name} locally.`, 'success')
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That file could not be opened.')
    } finally {
      setIsLoading(false)
    }
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

  return (
    <div className="min-h-screen bg-[#0b0b0c] text-zinc-100">
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
            onOpen={() => projectInputRef.current?.click()}
            onSave={() => void saveProject()}
            onAddImage={() => imageInputRef.current?.click()}
            onPlaceLinkedSmartObject={() => linkedSmartObjectInputRef.current?.click()}
            onLoadFont={() => fontInputRef.current?.click()}
            onLoadBrush={() => brushInputRef.current?.click()}
            onExport={(format) => void exportImage(format)}
            onUndo={performUndo}
            onRedo={performRedo}
            onTransformAgain={() => { if (lastGeometryTransform) dispatch({ type: 'update-layers', changes: selectedLayers.filter((layer) => layer.type !== 'adjustment').map((layer) => ({ id: layer.id, patch: { geometryTransform: structuredClone(lastGeometryTransform) } })) }) }}
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
            canUndo={history.past.length > 0 || rasterUndoRef.current.length > 0}
            canRedo={history.future.length > 0 || rasterRedoRef.current.length > 0}
            canTransformAgain={Boolean(lastGeometryTransform && selectedLayers.some((layer) => layer.type !== 'adjustment'))}
            hasLayerSelection={Boolean(selectedGroup || selectedLayers.length)}
            canRasterize={selectedLayers.length === 1 && !['raster', 'adjustment'].includes(selectedLayers[0].type)}
            canConvertToSmartObject={selectedLayers.length === 1 && !['adjustment', 'smart-object'].includes(selectedLayers[0].type)}
            smartObjectKind={selectedLayers.length === 1 && selectedLayers[0].type === 'smart-object' ? selectedLayers[0].source.kind : undefined}
            hasLayerEffects={selectedLayers.some((layer) => hasEnabledLayerEffects(layer.effects))}
            hasPixelSelection={Boolean(selection?.bounds)}
            hasFilterTarget={selectedLayers.some((layer) => layer.type !== 'adjustment' && !layerIsLocked(document, layer))}
            saving={isProjectSaving}
            exporting={isExporting}
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
        <div className="flex min-w-0 flex-1 overflow-x-auto">
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
        <ToolRail tool={tool} onChange={setTool} />
        <Inspector document={document} dispatch={dispatch} endHistoryGroup={endHistoryGroup} onBackgroundImage={() => backgroundInputRef.current?.click()} backgroundImageName={backgroundName} customFonts={customFonts} onLoadFont={() => fontInputRef.current?.click()} onOpenSmartObject={openSmartObjectContents} onReplaceSmartObject={() => replaceSmartObjectInputRef.current?.click()} onRelinkSmartObject={() => relinkSmartObjectInputRef.current?.click()} onExportSmartObject={() => void exportSmartObjectContents()} onContentAwareScale={(layerId, width, height) => void contentAwareScaleLayer(layerId, width, height)} dockSide={workspaceLayout.propertiesOnLeft ? 'left' : 'right'} onSwapPanels={() => setWorkspaceLayout((current) => ({ ...current, propertiesOnLeft: !current.propertiesOnLeft }))} width={workspaceLayout.panelWidths.properties} onWidthChange={(width) => setWorkspaceLayout((current) => ({ ...current, panelWidths: { ...current.panelWidths, properties: width } }))} collapsed={workspaceLayout.collapsedPanels.properties} onToggleCollapsed={() => setWorkspaceLayout((current) => ({ ...current, collapsedPanels: { ...current.collapsedPanels, properties: !current.collapsedPanels.properties } }))} />
        <CanvasStage canvasRef={canvasRef} document={document} assets={assets} dispatch={dispatch} endHistoryGroup={endHistoryGroup} isLoading={isLoading} onFile={(file) => void addImageFile(file)} canUndo={history.past.length > 0 || rasterUndoRef.current.length > 0} canRedo={history.future.length > 0 || rasterRedoRef.current.length > 0} onUndo={performUndo} onRedo={performRedo} onAlign={alignSelection} onRasterChange={refreshRasterAsset} onRasterCommit={commitRasterEdit} editingMaskLayerId={editingMaskLayerId} selection={selection} onSelectionChange={setSelection} zoom={zoom} onZoomChange={setZoom} tool={tool} onToolChange={setTool} onAddText={addTextAt} onAddShape={addShapeAt} onCrop={cropDocument} onPerspectiveCrop={perspectiveCropDocument} brushes={[roundBrush, ...customBrushes]} brushId={brushId} onBrushChange={setBrushId} onLoadBrush={() => brushInputRef.current?.click()} foregroundColor={foregroundColor} backgroundColor={backgroundColor} onForegroundColorChange={(color) => setForegroundColor(normalizeHexColor(color, foregroundColor))} onBackgroundColorChange={(color) => setBackgroundColor(normalizeHexColor(color, backgroundColor))} />
        <LayersPanel document={document} dispatch={dispatch} onAddLayer={addEmptyLayer} onAddAdjustment={addAdjustment} onAddGroup={addLayerGroup} editingMaskLayerId={editingMaskLayerId} onAddMask={addLayerMask} onEditMask={editLayerMask} onRemoveMask={removeLayerMask} dockSide={workspaceLayout.propertiesOnLeft ? 'right' : 'left'} onSwapPanels={() => setWorkspaceLayout((current) => ({ ...current, propertiesOnLeft: !current.propertiesOnLeft }))} width={workspaceLayout.panelWidths.layers} onWidthChange={(width) => setWorkspaceLayout((current) => ({ ...current, panelWidths: { ...current.panelWidths, layers: width } }))} collapsed={workspaceLayout.collapsedPanels.layers} onToggleCollapsed={() => setWorkspaceLayout((current) => ({ ...current, collapsedPanels: { ...current.collapsedPanels, layers: !current.collapsedPanels.layers } }))} activePanel={workspaceLayout.activeUtilityPanel} onActivePanelChange={(activeUtilityPanel) => setWorkspaceLayout((current) => ({ ...current, activeUtilityPanel }))} assets={assets} canvasRef={canvasRef} selection={selection} onLoadComponentChannel={loadComponentChannel} onSaveAlphaChannel={saveAlphaChannel} onLoadAlphaChannel={loadAlphaChannel} onDuplicateAlphaChannel={duplicateAlphaChannel} onDeleteAlphaChannel={deleteAlphaChannel} onTransformAlphaChannel={transformAlphaChannel} onFillPath={(path) => addPathShape(path, 'fill')} onStrokePath={(path) => addPathShape(path, 'stroke')} customShapes={customShapes} onSaveCustomShape={saveCustomShape} onApplyCustomShape={applyCustomShape} onRemoveCustomShape={(id) => setCustomShapes((current) => current.filter((shape) => shape.id !== id))} onImportCustomShape={() => shapeInputRef.current?.click()} onExportPath={exportDocumentPath} zoom={zoom} onZoomChange={setZoom} renderer={rendererCapabilities.activeRenderer} historyPast={history.past} historyFuture={history.future} rasterUndoDepth={rasterUndoRef.current.length} onJumpHistory={jumpDocumentHistory} renderRevision={resourceRevision + Object.values(assets).reduce((total, asset) => total + (asset.revision ?? 0), 0)} panelOrder={workspaceLayout.utilityPanelOrder} onPanelOrderChange={(moved, before) => setWorkspaceLayout((current) => ({ ...current, utilityPanelOrder: reorderUtilityPanels(current.utilityPanelOrder, moved, before) }))} floating={workspaceLayout.utilityPanelFloating} floatingPosition={workspaceLayout.floatingPanelPosition} onFloatingPositionChange={(floatingPanelPosition) => setWorkspaceLayout((current) => ({ ...current, floatingPanelPosition }))} onToggleFloating={() => setWorkspaceLayout((current) => ({ ...current, utilityPanelFloating: !current.utilityPanelFloating, collapsedPanels: { ...current.collapsedPanels, layers: false } }))} foregroundColor={foregroundColor} backgroundColor={backgroundColor} customSwatches={customSwatches} onForegroundColorChange={(color) => setForegroundColor(normalizeHexColor(color, foregroundColor))} onBackgroundColorChange={(color) => setBackgroundColor(normalizeHexColor(color, backgroundColor))} onAddSwatch={(color) => setCustomSwatches((current) => normalizeCustomSwatches([...current, color]))} onRemoveSwatch={(color) => setCustomSwatches((current) => current.filter((swatch) => swatch !== color))} customGradients={customGradients} onApplyGradient={(gradient) => { setForegroundColor(gradient.start); setBackgroundColor(gradient.end); setTool('gradient') }} onAddGradient={(name, start, end) => setCustomGradients((current) => normalizeCustomGradients([...current, { id: createId(), name, start, end }]))} onRemoveGradient={(id) => setCustomGradients((current) => current.filter((gradient) => gradient.id !== id))} customPatterns={customPatterns} onApplyPattern={(pattern) => dispatch({ type: 'set-pattern', patch: pattern })} onAddPattern={(name, pattern) => setCustomPatterns((current) => normalizeCustomPatterns([...current, { id: createId(), name, ...pattern }]))} onRemovePattern={(id) => setCustomPatterns((current) => current.filter((pattern) => pattern.id !== id))} brushes={[roundBrush, ...customBrushes]} brushId={brushId} customFonts={customFonts} onBrushChange={(id) => { setBrushId(id); setTool('brush') }} onLoadBrush={() => brushInputRef.current?.click()} onRemoveBrush={(id) => void removeBrushFromLibrary(id)} onLoadFont={() => fontInputRef.current?.click()} />
      </main>

      <input ref={imageInputRef} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addImageFile(file); event.target.value = '' }} />
      <input ref={linkedSmartObjectInputRef} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addLinkedSmartObjectFile(file); event.target.value = '' }} />
      <input ref={replaceSmartObjectInputRef} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void replaceSmartObjectSource(file, 'embedded'); event.target.value = '' }} />
      <input ref={relinkSmartObjectInputRef} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void replaceSmartObjectSource(file, 'linked'); event.target.value = '' }} />
      <input ref={backgroundInputRef} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void setBackgroundFile(file); event.target.value = '' }} />
      <input ref={projectInputRef} type="file" className="sr-only" accept=".studio,.psd,.svg,image/png,image/jpeg,image/webp,image/svg+xml,application/json,application/x-studio+json,image/vnd.adobe.photoshop" onChange={(event) => { const file = event.target.files?.[0]; if (file) void openFile(file); event.target.value = '' }} />
      <input ref={fontInputRef} type="file" className="sr-only" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadFontFile(file); event.target.value = '' }} />
      <input ref={brushInputRef} type="file" className="sr-only" accept=".studio-brush,.json,image/png,image/jpeg,image/webp,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadBrushFile(file); event.target.value = '' }} />
      <input ref={shapeInputRef} type="file" className="sr-only" accept=".studio-shape,application/json,application/x-studio-shape+json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadCustomShapeFile(file); event.target.value = '' }} />

      {notice && <Toast value={notice} onDismiss={() => setNotice(null)} />}
      {selectionWorkspaceSource && <SelectAndMaskWorkspace source={selectionWorkspaceSource} onPreview={setSelection} onApply={() => setSelectionWorkspaceSource(null)} onCancel={() => { setSelection(cloneSelection(selectionWorkspaceSource)); setSelectionWorkspaceSource(null) }} />}
    </div>
  )
}

export default App
