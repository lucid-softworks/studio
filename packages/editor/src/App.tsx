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
import { createAdjustmentLayer, createId, createImageLayer, createLayerGroup, createRasterLayer, createShapeLayer, createTextLayer, duplicateLayer, getDocumentSize, initialDocument } from './editor/presets'
import { loadRecoveryProject, parseProjectFile, saveRecoveryProject, serializeProject } from './editor/project'
import { calculateImageRect, getLayerBounds, renderComposition } from './editor/renderer'
import { getDescendantGroupIds, groupIsLocked, layerIsLocked } from './editor/stack'
import type { RasterEdit } from './editor/raster'
import type { AssetMap, EditorDispatch, LayerFilters, LayerPatch, Position, ShapeKind } from './editor/types'
import { featherSelection, invertSelection, morphSelection, selectAll, type SelectionBounds, type SelectionState } from './editor/selection'
import { useCanvasRenderer } from './editor/use-canvas-renderer'
import { importBrush, importFont, loadBrushLibrary, loadFontLibrary, roundBrush, type BrushPreset, type CustomFontResource } from './editor/resources'

type ExportFormat = 'png' | 'jpeg' | 'webp'
type Alignment = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom'

type AppProps = { onExit?: () => void }

function App({ onExit }: AppProps) {
  const [history, historyDispatch] = useReducer(historyReducer, initialHistoryState)
  const [, bumpRasterHistory] = useReducer((value: number) => value + 1, 0)
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [assets, setAssets] = useState<AssetMap>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [isProjectSaving, setIsProjectSaving] = useState(false)
  const [editingMaskLayerId, setEditingMaskLayerId] = useState<string | null>(null)
  const [tool, setTool] = useState<EditorTool>('move')
  const [zoom, setZoom] = useState(100)
  const [customFonts, setCustomFonts] = useState<CustomFontResource[]>([])
  const [customBrushes, setCustomBrushes] = useState<BrushPreset[]>([])
  const [brushId, setBrushId] = useState(roundBrush.id)
  const [resourceRevision, bumpResourceRevision] = useReducer((value: number) => value + 1, 0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const fontInputRef = useRef<HTMLInputElement>(null)
  const brushInputRef = useRef<HTMLInputElement>(null)
  const hydratedRef = useRef(false)
  const rasterUndoRef = useRef<Array<RasterEdit & { depth: number }>>([])
  const rasterRedoRef = useRef<Array<RasterEdit & { depth: number }>>([])
  const assetsRef = useRef(assets)
  const document = history.present

  assetsRef.current = assets
  useCanvasRenderer(canvasRef, document, assets, resourceRevision)

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
  }, [])

  const loadFontFile = useCallback(async (file: File) => {
    try {
      const font = await importFont(file)
      setCustomFonts((current) => [...current.filter((candidate) => candidate.id !== font.id), font])
      bumpResourceRevision()
      setNotice(`Loaded ${font.name}. Select it from a text layer’s font menu.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That font could not be loaded.')
    }
  }, [])

  const loadBrushFile = useCallback(async (file: File) => {
    try {
      const brush = await importBrush(file)
      setCustomBrushes((current) => [...current.filter((candidate) => candidate.id !== brush.id), brush])
      setBrushId(brush.id)
      setTool('brush')
      setNotice(`Loaded ${brush.name} and selected it for painting.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That brush could not be loaded.')
    }
  }, [])

  const dispatch = useCallback<EditorDispatch>((action, options) => {
    if (rasterRedoRef.current.length) {
      rasterRedoRef.current = []
      bumpRasterHistory()
    }
    if (action.type === 'reset-document') setSelection(null)
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
  }, [dispatch])

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
  }, [dispatch])

  useEffect(() => {
    let cancelled = false
    const hydrate = async () => {
      try {
        const recovery = await loadRecoveryProject()
        if (cancelled) return
        if (recovery) {
          setAssets(recovery.assets)
          historyDispatch({ type: 'replace', document: recovery.document })
          setNotice('Recovered your locally autosaved project.')
        }
      } catch {
        if (!cancelled) setNotice('Local recovery was unavailable, so a fresh document was opened.')
      } finally {
        if (!cancelled) {
          hydratedRef.current = true
          setIsLoading(false)
        }
      }
    }
    void hydrate()
    return () => { cancelled = true }
  }, [dispatch])

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

  const refreshRasterAsset = useCallback((assetId: string) => {
    setAssets((current) => {
      const asset = current[assetId]
      return asset ? { ...current, [assetId]: { ...asset, revision: (asset.revision ?? 0) + 1 } } : current
    })
  }, [])

  const applyRasterEdit = useCallback((edit: RasterEdit, side: 'before' | 'after') => {
    const asset = assetsRef.current[edit.assetId]
    const context = asset?.surface?.getContext('2d', { willReadFrequently: true })
    if (!asset?.surface || !context) return
    context.putImageData(edit[side], edit.x, edit.y)
    refreshRasterAsset(edit.assetId)
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
    for (const asset of Object.values(assetsRef.current)) {
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
    renderComposition(canvas, {
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

  const exportImage = (format: ExportFormat) => {
    setIsExporting(true)
    const exportCanvas = window.document.createElement('canvas')
    renderComposition(exportCanvas, { ...document, selectedLayerId: null }, assets)
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

  const openProject = async (file: File) => {
    setIsLoading(true)
    setNotice(null)
    try {
      const loaded = await parseProjectFile(file)
      for (const asset of Object.values(assetsRef.current)) if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl)
      setAssets(loaded.assets)
      rasterUndoRef.current = []
      rasterRedoRef.current = []
      bumpRasterHistory()
      historyDispatch({ type: 'replace', document: loaded.document })
      setSelection(null)
      setNotice(`Opened ${file.name} entirely in your browser.`)
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
      if (extension === 'psd' || file.type === 'image/vnd.adobe.photoshop') {
        const { importPsdFile } = await import('./editor/psd')
        loaded = await importPsdFile(file)
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
      for (const asset of Object.values(assetsRef.current)) if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl)
      setAssets(loaded.assets)
      rasterUndoRef.current = []
      rasterRedoRef.current = []
      bumpRasterHistory()
      historyDispatch({ type: 'replace', document: loaded.document })
      setSelection(null)
      setNotice(`Opened ${file.name} locally.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That file could not be opened.')
    } finally {
      setIsLoading(false)
    }
  }

  const newDocument = () => {
    for (const asset of Object.values(assetsRef.current)) if (asset.objectUrl) URL.revokeObjectURL(asset.objectUrl)
    setAssets({})
    rasterUndoRef.current = []
    rasterRedoRef.current = []
    bumpRasterHistory()
    historyDispatch({ type: 'replace', document: structuredClone(initialDocument) })
    setEditingMaskLayerId(null)
    setTool('move')
    setZoom(100)
    setSelection(null)
    setNotice(null)
  }

  const backgroundName = document.background.imageAssetId ? assets[document.background.imageAssetId]?.name : undefined

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
            onLoadFont={() => fontInputRef.current?.click()}
            onLoadBrush={() => brushInputRef.current?.click()}
            onExport={exportImage}
            onUndo={performUndo}
            onRedo={performRedo}
            onRotateCanvas={(direction) => transformCanvas(direction === 'cw' ? 'rotate-cw' : 'rotate-ccw')}
            onFlipCanvas={(axis) => transformCanvas(axis === 'x' ? 'flip-x' : 'flip-y')}
            onNewLayer={addEmptyLayer}
            onNewGroup={addLayerGroup}
            onDuplicateLayer={duplicateSelection}
            onRasterizeLayer={rasterizeSelectedLayer}
            onClearLayerEffects={() => dispatch({ type: 'update-layers', changes: selectedLayers.filter((layer) => layer.type !== 'adjustment').map((layer) => ({ id: layer.id, patch: { effects: null } })) })}
            onDeleteLayer={deleteSelection}
            onSelectAll={applySelectAll}
            onDeselect={() => setSelection(null)}
            onInvertSelection={() => applySelectionOperation('invert')}
            onFeatherSelection={() => applySelectionOperation('feather')}
            onExpandSelection={() => applySelectionOperation('expand')}
            onContractSelection={() => applySelectionOperation('contract')}
            onFilter={(preset) => {
              if (preset === 'blur') applyFilter({ blur: 8 })
              else if (preset === 'sharpen') applyFilter({ contrast: 115, saturation: 108 })
              else if (preset === 'grayscale') applyFilter({ grayscale: 100 })
              else if (preset === 'sepia') applyFilter({ sepia: 100 })
              else if (preset === 'invert') applyFilter({ invert: 100 })
              else resetFilters()
            }}
            onZoom={(command) => setZoom((current) => command === 'actual' ? 100 : Math.max(25, Math.min(250, current + (command === 'in' ? 25 : -25))))}
            canUndo={history.past.length > 0 || rasterUndoRef.current.length > 0}
            canRedo={history.future.length > 0 || rasterRedoRef.current.length > 0}
            hasLayerSelection={Boolean(selectedGroup || selectedLayers.length)}
            canRasterize={selectedLayers.length === 1 && !['raster', 'adjustment'].includes(selectedLayers[0].type)}
            hasLayerEffects={selectedLayers.some((layer) => hasEnabledLayerEffects(layer.effects))}
            hasPixelSelection={Boolean(selection?.bounds)}
            hasFilterTarget={selectedLayers.some((layer) => layer.type !== 'adjustment' && !layerIsLocked(document, layer))}
            saving={isProjectSaving}
            exporting={isExporting}
          />
        </div>

        <div className="hidden items-center gap-2 text-[9px] font-medium text-zinc-700 sm:flex"><span className={`size-1.5 rounded-full ${saveStatus === 'saving' ? 'bg-amber-400' : saveStatus === 'saved' ? 'bg-emerald-400/70' : 'bg-zinc-700'}`} /><span>{saveStatus === 'saving' ? 'Saving locally…' : saveStatus === 'saved' ? 'Saved locally' : 'Local only'}</span></div>
      </header>

      <main className="flex flex-col lg:flex-row">
        <ToolRail tool={tool} onChange={setTool} />
        <Inspector document={document} dispatch={dispatch} endHistoryGroup={endHistoryGroup} onBackgroundImage={() => backgroundInputRef.current?.click()} backgroundImageName={backgroundName} customFonts={customFonts} onLoadFont={() => fontInputRef.current?.click()} />
        <CanvasStage canvasRef={canvasRef} document={document} assets={assets} dispatch={dispatch} endHistoryGroup={endHistoryGroup} isLoading={isLoading} onFile={(file) => void addImageFile(file)} canUndo={history.past.length > 0 || rasterUndoRef.current.length > 0} canRedo={history.future.length > 0 || rasterRedoRef.current.length > 0} onUndo={performUndo} onRedo={performRedo} onAlign={alignSelection} onRasterChange={refreshRasterAsset} onRasterCommit={commitRasterEdit} editingMaskLayerId={editingMaskLayerId} selection={selection} onSelectionChange={setSelection} zoom={zoom} onZoomChange={setZoom} tool={tool} onToolChange={setTool} onAddText={addTextAt} onAddShape={addShapeAt} onCrop={cropDocument} brushes={[roundBrush, ...customBrushes]} brushId={brushId} onBrushChange={setBrushId} onLoadBrush={() => brushInputRef.current?.click()} />
        <LayersPanel document={document} dispatch={dispatch} onAddLayer={addEmptyLayer} onAddAdjustment={addAdjustment} onAddGroup={addLayerGroup} editingMaskLayerId={editingMaskLayerId} onAddMask={addLayerMask} onEditMask={editLayerMask} onRemoveMask={removeLayerMask} />
      </main>

      <input ref={imageInputRef} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addImageFile(file); event.target.value = '' }} />
      <input ref={backgroundInputRef} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void setBackgroundFile(file); event.target.value = '' }} />
      <input ref={projectInputRef} type="file" className="sr-only" accept=".studio,.psd,image/png,image/jpeg,image/webp,application/json,application/x-studio+json,image/vnd.adobe.photoshop" onChange={(event) => { const file = event.target.files?.[0]; if (file) void openFile(file); event.target.value = '' }} />
      <input ref={fontInputRef} type="file" className="sr-only" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadFontFile(file); event.target.value = '' }} />
      <input ref={brushInputRef} type="file" className="sr-only" accept=".studio-brush,.json,image/png,image/jpeg,image/webp,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadBrushFile(file); event.target.value = '' }} />

      {notice && (
        <div role="status" className="fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-red-300/15 bg-red-950/90 px-4 py-3 text-xs text-red-100 shadow-2xl backdrop-blur-md">
          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-red-400" /><span>{notice}</span>
          <button type="button" className="ml-2 text-red-300/60 hover:text-red-100" onClick={() => setNotice(null)} aria-label="Dismiss message">×</button>
        </div>
      )}
    </div>
  )
}

export default App
