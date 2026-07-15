import type { RasterRegion } from './raster'

/**
 * Runtime-only image state. These values contain browser objects and must never
 * be embedded in the serializable EditorDocument schema; documents refer to
 * them exclusively by asset ID.
 */
export type SourceImage = {
  element: HTMLImageElement
  name: string
  blob?: Blob
  surface?: HTMLCanvasElement
  revision?: number
  dirtyRegions?: Array<{ revision: number; region: RasterRegion }>
  objectUrl?: string
  isDemo?: boolean
}

export type AssetMap = Record<string, SourceImage>
