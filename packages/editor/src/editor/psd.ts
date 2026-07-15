import { initializeCanvas, readPsd, type Layer, type Psd } from 'ag-psd'
import { loadImageBlob, surfaceToBlob } from './image'
import { createId, createRasterLayer, initialDocument } from './presets'
import type { AssetMap, BlendMode, EditorDocument, LayerGroup, RasterLayer } from './types'

let initialized = false

function initializeBrowserCanvas() {
  if (initialized) return
  initializeCanvas((width, height) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }, (width, height) => new ImageData(width, height))
  initialized = true
}

export function psdLayerNamesInEditorOrder(layers: Layer[], parent = '', sourceIsTopToBottom = true): string[] {
  const editorOrder = sourceIsTopToBottom ? [...layers].reverse() : layers
  return editorOrder.flatMap((layer, editorIndex) => {
    const name = layer.name?.trim() || `Layer ${sourceIsTopToBottom ? layers.length - editorIndex : editorIndex + 1}`
    const path = parent ? `${parent} / ${name}` : name
    return layer.children ? psdLayerNamesInEditorOrder(layer.children, path, sourceIsTopToBottom) : [path]
  })
}

async function sourceFromCanvas(canvas: HTMLCanvasElement, name: string) {
  const blob = await surfaceToBlob(canvas)
  const source = await loadImageBlob(blob, name)
  return { ...source, surface: canvas, revision: 0 }
}

function layerCanvas(layer: Layer | Psd) {
  if (layer.imageData) {
    const canvas = document.createElement('canvas')
    canvas.width = layer.imageData.width
    canvas.height = layer.imageData.height
    const context = canvas.getContext('2d')
    if (!context) return null
    const pixels = new ImageData(new Uint8ClampedArray(layer.imageData.data), layer.imageData.width, layer.imageData.height)
    context.putImageData(pixels, 0, 0)
    return canvas
  }
  return layer.canvas ?? null
}

const supportedBlendModes = new Set<BlendMode>([
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
])

function blendMode(value: Layer['blendMode']): BlendMode {
  return value && supportedBlendModes.has(value as BlendMode) ? value as BlendMode : 'normal'
}

type PreviewLayer = { layer: Layer; hidden: boolean; opacity: number }

function previewLayers(layers: Layer[], parentHidden = false, parentOpacity = 1): PreviewLayer[] {
  return layers.flatMap((layer) => {
    const hidden = parentHidden || Boolean(layer.hidden)
    const opacity = parentOpacity * (layer.opacity ?? 1)
    return layer.children ? previewLayers(layer.children, hidden, opacity) : [{ layer, hidden, opacity }]
  })
}

function renderOrderPreview(psd: Psd, layers: PreviewLayer[], sourceIsTopToBottom: boolean, canvasCache: WeakMap<Layer, HTMLCanvasElement>) {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.setTransform(canvas.width / psd.width, 0, 0, canvas.height / psd.height, 0, 0)
  const drawOrder = sourceIsTopToBottom ? [...layers].reverse() : layers
  for (const { layer, hidden, opacity } of drawOrder) {
    if (hidden) continue
    let source = canvasCache.get(layer)
    if (!source) {
      source = layerCanvas(layer) ?? undefined
      if (source) canvasCache.set(layer, source)
    }
    if (!source) continue
    context.save()
    context.globalAlpha = opacity
    const mode = blendMode(layer.blendMode)
    context.globalCompositeOperation = mode === 'normal' ? 'source-over' : mode
    context.drawImage(source, layer.left ?? 0, layer.top ?? 0)
    context.restore()
  }
  context.setTransform(1, 0, 0, 1, 0, 0)
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

function imageDifference(left: ImageData, right: ImageData) {
  let score = 0
  for (let index = 0; index < left.data.length; index += 1) score += Math.abs(left.data[index] - right.data[index])
  return score
}

function detectSourceTopToBottom(psd: Psd) {
  const composite = layerCanvas(psd)
  const children = psd.children ?? []
  if (!composite || children.length < 2) return true
  const referenceCanvas = document.createElement('canvas')
  referenceCanvas.width = 96
  referenceCanvas.height = 96
  const referenceContext = referenceCanvas.getContext('2d', { willReadFrequently: true })
  if (!referenceContext) return true
  referenceContext.drawImage(composite, 0, 0, referenceCanvas.width, referenceCanvas.height)
  const reference = referenceContext.getImageData(0, 0, referenceCanvas.width, referenceCanvas.height)
  const leaves = previewLayers(children)
  const canvasCache = new WeakMap<Layer, HTMLCanvasElement>()
  const topToBottom = renderOrderPreview(psd, leaves, true, canvasCache)
  const bottomToTop = renderOrderPreview(psd, leaves, false, canvasCache)
  if (!topToBottom || !bottomToTop) return true
  return imageDifference(topToBottom, reference) <= imageDifference(bottomToTop, reference)
}

export async function importPsdFile(file: File): Promise<{ document: EditorDocument; assets: AssetMap }> {
  initializeBrowserCanvas()
  let psd
  try {
    psd = readPsd(await file.arrayBuffer(), { skipThumbnail: true, useImageData: true })
  } catch (error) {
    throw new Error(error instanceof Error ? `PSD import failed: ${error.message}` : 'That PSD file could not be decoded.')
  }

  const assets: AssetMap = {}
  const layers: RasterLayer[] = []
  const groups: LayerGroup[] = []
  const sourceIsTopToBottom = detectSourceTopToBottom(psd)

  const importChildren = async (children: Layer[], parentId: string | null, parentPath = '') => {
    const editorOrder = sourceIsTopToBottom ? [...children].reverse() : children
    for (const [stackOrder, layer] of editorOrder.entries()) {
      const name = layer.name?.trim() || `Layer ${sourceIsTopToBottom ? children.length - stackOrder : stackOrder + 1}`
      const path = parentPath ? `${parentPath} / ${name}` : name
      if (layer.children) {
        const id = createId()
        groups.push({
          id,
          name,
          visible: !layer.hidden,
          locked: Boolean(layer.protected?.position || layer.protected?.composite),
          opacity: Math.round((layer.opacity ?? 1) * 100),
          blendMode: blendMode(layer.blendMode),
          passThrough: layer.blendMode === 'pass through',
          collapsed: layer.opened === false,
          parentId,
          stackOrder,
        })
        await importChildren(layer.children, id, path)
        continue
      }
      const canvas = layerCanvas(layer)
      if (!canvas || canvas.width === 0 || canvas.height === 0) continue
      const assetId = createId()
      assets[assetId] = await sourceFromCanvas(canvas, path)
      const left = layer.left ?? 0
      const top = layer.top ?? 0
      const centerX = left + canvas.width / 2
      const centerY = top + canvas.height / 2
      const raster = createRasterLayer(assetId, name, canvas.width, canvas.height, {
        x: (centerX - psd.width / 2) / psd.width,
        y: (centerY - psd.height / 2) / psd.height,
      })
      raster.visible = !layer.hidden
      raster.locked = Boolean(layer.protected?.position || layer.protected?.composite)
      raster.opacity = Math.round((layer.opacity ?? 1) * 100)
      raster.blendMode = blendMode(layer.blendMode)
      raster.clipToBelow = Boolean(layer.clipping)
      raster.groupId = parentId
      raster.stackOrder = stackOrder
      layers.push(raster)
    }
  }

  await importChildren(psd.children ?? [], null)

  const composite = layerCanvas(psd)
  if (layers.length === 0 && composite) {
    const assetId = createId()
    assets[assetId] = await sourceFromCanvas(composite, file.name)
    layers.push(createRasterLayer(assetId, file.name.replace(/\.psd$/i, ''), psd.width, psd.height))
  }
  if (layers.length === 0) throw new Error('The PSD did not contain any rasterizable layer data.')

  const selectedLayerId = layers.at(-1)?.id ?? null
  return {
    assets,
    document: {
      ...initialDocument,
      canvasPreset: 'custom',
      canvasSize: { width: psd.width, height: psd.height },
      background: { ...initialDocument.background, kind: 'transparent' },
      groups,
      layers,
      selectedLayerId,
      selectedLayerIds: selectedLayerId ? [selectedLayerId] : [],
    },
  }
}
