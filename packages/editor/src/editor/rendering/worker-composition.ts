import type { EditorDocument } from '../types'

export type WorkerCompositionAsset = {
  id: string
  name: string
  revision: number
  bitmap: ImageBitmap
}

export type WorkerCompositionRequest = {
  id: number
  document: EditorDocument
  assets: WorkerCompositionAsset[]
}

export type WorkerCompositionResponse = {
  id: number
  width: number
  height: number
  frame: ImageBitmap
}

export function supportsWorkerComposition(document: EditorDocument) {
  return document.layers.every((layer) => layer.type !== 'text')
}
