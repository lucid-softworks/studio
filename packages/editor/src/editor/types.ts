export type Position = { x: number; y: number }
export type BackgroundKind = 'gradient' | 'solid' | 'image' | 'transparent'
export type PatternKind = 'none' | 'grid' | 'dots' | 'waves'
export type ShapeKind = 'rectangle' | 'ellipse'
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity'
export type LayerFilters = { brightness: number; contrast: number; saturation: number; blur: number }

export type SourceImage = {
  element: HTMLImageElement
  name: string
  blob?: Blob
  surface?: HTMLCanvasElement
  revision?: number
  objectUrl?: string
  isDemo?: boolean
}

export type AssetMap = Record<string, SourceImage>

export type BaseLayer = {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  position: Position
  rotation: number
  blendMode?: BlendMode
  filters?: LayerFilters
  maskAssetId?: string | null
  clipToBelow?: boolean
  groupId?: string | null
}

export type LayerGroup = {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: BlendMode
  collapsed: boolean
}

export type ImageLayer = BaseLayer & {
  type: 'image'
  assetId: string
  padding: number
  scale: number
  cornerRadius: number
  shadow: number
  flipX: boolean
  flipY: boolean
}

export type RasterLayer = BaseLayer & {
  type: 'raster'
  assetId: string
  width: number
  height: number
  scale: number
}

export type TextLayer = BaseLayer & {
  type: 'text'
  text: string
  color: string
  fontSize: number
  fontWeight: 400 | 600 | 700
  textAlign: 'left' | 'center' | 'right'
  letterSpacing: number
}

export type ShapeLayer = BaseLayer & {
  type: 'shape'
  shape: ShapeKind
  width: number
  height: number
  fill: string
  stroke: string
  strokeWidth: number
  cornerRadius: number
}

export type AdjustmentLayer = BaseLayer & {
  type: 'adjustment'
  brightness: number
  contrast: number
  saturation: number
  hue: number
  blur: number
}

export type EditorLayer = ImageLayer | RasterLayer | TextLayer | ShapeLayer | AdjustmentLayer

export type BackgroundSettings = {
  kind: BackgroundKind
  gradient: [string, string]
  solidColor: string
  gradientAngle: number
  imageAssetId: string | null
  imageBlur: number
  imageOverlay: number
}

export type PatternSettings = {
  kind: PatternKind
  color: string
  opacity: number
  size: number
}

export type EditorDocument = {
  canvasPreset: string
  canvasSize: { width: number; height: number }
  background: BackgroundSettings
  pattern: PatternSettings
  groups: LayerGroup[]
  layers: EditorLayer[]
  selectedLayerId: string | null
  selectedLayerIds: string[]
  selectedGroupId: string | null
}

export type LayerPatch = Partial<{
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  position: Position
  rotation: number
  blendMode: BlendMode
  filters: LayerFilters
  maskAssetId: string | null
  clipToBelow: boolean
  groupId: string | null
  assetId: string
  padding: number
  scale: number
  cornerRadius: number
  shadow: number
  flipX: boolean
  flipY: boolean
  text: string
  color: string
  fontSize: number
  fontWeight: 400 | 600 | 700
  textAlign: 'left' | 'center' | 'right'
  letterSpacing: number
  shape: ShapeKind
  width: number
  height: number
  fill: string
  stroke: string
  strokeWidth: number
  brightness: number
  contrast: number
  saturation: number
  hue: number
  blur: number
}>

export type GroupPatch = Partial<Omit<LayerGroup, 'id'>>

export type DocumentAction =
  | { type: 'set-canvas-preset'; value: string }
  | { type: 'set-canvas-size'; width: number; height: number }
  | { type: 'set-background'; patch: Partial<BackgroundSettings> }
  | { type: 'set-pattern'; patch: Partial<PatternSettings> }
  | { type: 'add-layer'; layer: EditorLayer }
  | { type: 'add-group'; group: LayerGroup; layerIds: string[] }
  | { type: 'update-layer'; id: string; patch: LayerPatch }
  | { type: 'update-layers'; changes: Array<{ id: string; patch: LayerPatch }> }
  | { type: 'update-group'; id: string; patch: GroupPatch }
  | { type: 'remove-layer'; id: string }
  | { type: 'remove-layers'; ids: string[] }
  | { type: 'remove-group'; id: string; deleteLayers?: boolean }
  | { type: 'select-layer'; id: string | null; mode?: 'replace' | 'toggle' | 'add' }
  | { type: 'select-group'; id: string | null }
  | { type: 'move-layer'; id: string; direction: 'up' | 'down' }
  | { type: 'move-group'; id: string; direction: 'up' | 'down' }
  | { type: 'reset-document' }

export type HistoryState = {
  past: EditorDocument[]
  present: EditorDocument
  future: EditorDocument[]
  groupKey: string | null
}

export type HistoryAction =
  | { type: 'apply'; action: DocumentAction; record?: boolean; groupKey?: string }
  | { type: 'end-group' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'replace'; document: EditorDocument }
  | { type: 'discard-future' }

export type EditorDispatch = (
  action: DocumentAction,
  options?: { record?: boolean; groupKey?: string },
) => void
