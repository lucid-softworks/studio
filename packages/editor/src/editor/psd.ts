import { initializeCanvas, readPsd, type Layer } from 'ag-psd'
import { loadImageBlob, surfaceToBlob } from './image'
import { createId, createRasterLayer, initialDocument } from './presets'
import type { AssetMap, EditorDocument, RasterLayer } from './types'

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

type FlatLayer = { layer: Layer; path: string; hidden: boolean }

function flattenLayers(layers: Layer[], parent = '', parentHidden = false): FlatLayer[] {
  return layers.flatMap((layer, index) => {
    const name = layer.name?.trim() || `Layer ${index + 1}`
    const path = parent ? `${parent} / ${name}` : name
    const hidden = parentHidden || Boolean(layer.hidden)
    return layer.children?.length ? flattenLayers(layer.children, path, hidden) : [{ layer, path, hidden }]
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
  const flat = flattenLayers(psd.children ?? []).reverse()

  for (const { layer, path, hidden } of flat) {
    const canvas = layerCanvas(layer)
    if (!canvas || canvas.width === 0 || canvas.height === 0) continue
    const assetId = createId()
    assets[assetId] = await sourceFromCanvas(canvas, path)
    const left = layer.left ?? 0
    const top = layer.top ?? 0
    const centerX = left + canvas.width / 2
    const centerY = top + canvas.height / 2
    const raster = createRasterLayer(assetId, path, canvas.width, canvas.height, {
      x: (centerX - psd.width / 2) / psd.width,
      y: (centerY - psd.height / 2) / psd.height,
    })
    raster.visible = !hidden
    raster.opacity = Math.round((layer.opacity ?? 1) * 100)
    layers.push(raster)
  }

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
      layers,
      selectedLayerId,
      selectedLayerIds: selectedLayerId ? [selectedLayerId] : [],
    },
  }
}
