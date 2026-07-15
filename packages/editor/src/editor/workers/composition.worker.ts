/// <reference lib="webworker" />

import { renderComposition } from '../renderer'
import { getDocumentSize } from '../presets'
import { RenderResourceRegistry } from '../rendering/render-resource-registry'
import type { WorkerCompositionRequest, WorkerCompositionResponse } from '../rendering/worker-composition'
import type { AssetMap } from '../runtime-assets'

declare const self: DedicatedWorkerGlobalScope

const resources = new RenderResourceRegistry()
let canvas: OffscreenCanvas | null = null

const workerDocument = {
  createElement(tagName: string) {
    if (tagName !== 'canvas') throw new Error(`Unsupported worker element: ${tagName}`)
    return new OffscreenCanvas(1, 1)
  },
}

Object.assign(globalThis, { document: workerDocument })

self.onmessage = (event: MessageEvent<WorkerCompositionRequest>) => {
  const request = event.data
  const { width, height } = getDocumentSize(request.document)
  if (!canvas || canvas.width !== width || canvas.height !== height) canvas = new OffscreenCanvas(width, height)
  const assets = Object.fromEntries(request.assets.map((asset) => [asset.id, {
    name: asset.name,
    revision: asset.revision,
    surface: asset.bitmap as unknown as HTMLCanvasElement,
    element: {} as HTMLImageElement,
  }])) as AssetMap

  renderComposition(canvas as unknown as HTMLCanvasElement, request.document, assets, {}, resources)
  const frame = canvas.transferToImageBitmap()
  request.assets.forEach((asset) => asset.bitmap.close())
  const response: WorkerCompositionResponse = { id: request.id, width, height, frame }
  self.postMessage(response, [frame])
}

export {}
