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
  precision?: {
    bitDepth: 16 | 32
    width: number
    height: number
    data: Uint16Array | Float32Array
    revision: number
  }
}

export type AssetMap = Record<string, SourceImage>
