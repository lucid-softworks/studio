import { initializeCanvas, readPsd, type Layer } from 'ag-psd'
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

export function psdLayerNamesInEditorOrder(layers: Layer[], parent = ''): string[] {
  return [...layers].reverse().flatMap((layer, reverseIndex) => {
    const name = layer.name?.trim() || `Layer ${layers.length - reverseIndex}`
    const path = parent ? `${parent} / ${name}` : name
    return layer.children ? psdLayerNamesInEditorOrder(layer.children, path) : [path]
  })
}

async function sourceFromCanvas(canvas: HTMLCanvasElement, name: string) {
  const blob = await surfaceToBlob(canvas)
  const source = await loadImageBlob(blob, name)
  return { ...source, surface: canvas, revision: 0 }
}

function layerCanvas(layer: Layer) {
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

  const importChildren = async (children: Layer[], parentId: string | null, parentPath = '') => {
    const editorOrder = [...children].reverse()
    for (const [stackOrder, layer] of editorOrder.entries()) {
      const name = layer.name?.trim() || `Layer ${children.length - stackOrder}`
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
