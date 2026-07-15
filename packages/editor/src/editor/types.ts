export type Position = { x: number; y: number }
export const EDITOR_DOCUMENT_SCHEMA_VERSION = 2 as const
export type BackgroundKind = 'gradient' | 'solid' | 'image' | 'transparent'
export type PatternKind = 'none' | 'grid' | 'dots' | 'waves'
export type ShapeKind = 'rectangle' | 'ellipse' | 'path'
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity'
export type LayerFilters = { brightness: number; contrast: number; saturation: number; hue: number; grayscale: number; sepia: number; invert: number; blur: number }
export type LayerEffects = {
  dropShadow: { enabled: boolean; color: string; opacity: number; angle: number; distance: number; blur: number }
  outerGlow: { enabled: boolean; color: string; opacity: number; size: number }
  colorOverlay: { enabled: boolean; color: string; opacity: number }
}

export type VectorPath = {
  closed: boolean
  operation: 'exclude' | 'combine' | 'subtract' | 'intersect'
  fillRule: 'even-odd' | 'non-zero'
  knots: Array<{ linked: boolean; in: Position; anchor: Position; out: Position }>
}

export type LayerMaskSettings = {
  density: number
  feather: number
  linked: boolean
}

export type VectorMask = LayerMaskSettings & {
  paths: VectorPath[]
  inverted: boolean
  disabled: boolean
  fillStartsWithAllPixels: boolean
}

export type BlendIfSettings = {
  source: number[]
  destination: number[]
  channels: Array<{ source: number[]; destination: number[] }>
}

export type BaseLayer = {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  position: Position
  rotation: number
  flipX?: boolean
  flipY?: boolean
  blendMode?: BlendMode
  filters?: LayerFilters
  effects?: LayerEffects | null
  maskAssetId?: string | null
  maskSettings?: LayerMaskSettings
  vectorMask?: VectorMask
  blendIf?: BlendIfSettings
  clipToBelow?: boolean
  groupId?: string | null
  stackOrder?: number
}

export type LayerGroup = {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: BlendMode
  passThrough?: boolean
  collapsed: boolean
  parentId?: string | null
  stackOrder?: number
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

export type TextStyleRun = {
  start: number
  length: number
  fontFamily: string
  fontSize: number
  fontWeight: 400 | 600 | 700
  color: string
  letterSpacing: number
  leading?: number
  baselineShift?: number
  horizontalScale?: number
  verticalScale?: number
  fauxItalic?: boolean
  underline?: boolean
  strikethrough?: boolean
}

export type TextParagraphRun = {
  start: number
  length: number
  textAlign: 'left' | 'center' | 'right' | 'justify'
  firstLineIndent?: number
  startIndent?: number
  endIndent?: number
  spaceBefore?: number
  spaceAfter?: number
  leading?: number
}

export type TextWarp = {
  style: string
  value: number
  perspective: number
  perspectiveOther: number
  rotate: 'horizontal' | 'vertical'
}

export type TextLayer = BaseLayer & {
  type: 'text'
  text: string
  color: string
  fontFamily?: string
  fontSize: number
  fontWeight: 400 | 600 | 700
  textAlign: 'left' | 'center' | 'right'
  letterSpacing: number
  styleRuns?: TextStyleRun[]
  paragraphRuns?: TextParagraphRun[]
  paragraphBox?: { width: number; height: number }
  orientation?: 'horizontal' | 'vertical'
  warp?: TextWarp | null
  missingFonts?: string[]
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
  vectorPaths?: VectorPath[]
  fillStyle?:
    | { type: 'color'; color: string }
    | { type: 'gradient'; name: string; style: 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond'; angle: number; scale: number; colorStops: Array<{ color: string; position: number }>; opacityStops: Array<{ opacity: number; position: number }> }
    | { type: 'pattern'; id: string; name: string; scale: number; linked: boolean; phase: Position }
  strokeStyle?: {
    alignment: 'inside' | 'center' | 'outside'
    cap: 'butt' | 'round' | 'square'
    join: 'miter' | 'round' | 'bevel'
    miterLimit: number
    dashOffset: number
    dashes: number[]
    opacity: number
    blendMode: BlendMode
  }
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

export type DocumentChannel = {
  id?: number
  name: string
}

export type EditorDocument = {
  schemaVersion: typeof EDITOR_DOCUMENT_SCHEMA_VERSION
  canvasPreset: string
  canvasSize: { width: number; height: number }
  background: BackgroundSettings
  pattern: PatternSettings
  groups: LayerGroup[]
  layers: EditorLayer[]
  selectedLayerId: string | null
  selectedLayerIds: string[]
  selectedGroupId: string | null
  channels?: DocumentChannel[]
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
  effects: LayerEffects | null
  maskAssetId: string | null
  maskSettings: LayerMaskSettings
  vectorMask: VectorMask | null
  blendIf: BlendIfSettings | null
  clipToBelow: boolean
  groupId: string | null
  stackOrder: number
  assetId: string
  padding: number
  scale: number
  cornerRadius: number
  vectorPaths: NonNullable<ShapeLayer['vectorPaths']>
  fillStyle: NonNullable<ShapeLayer['fillStyle']> | null
  strokeStyle: NonNullable<ShapeLayer['strokeStyle']> | null
  shadow: number
  flipX: boolean
  flipY: boolean
  text: string
  color: string
  fontFamily: string
  fontSize: number
  fontWeight: 400 | 600 | 700
  textAlign: 'left' | 'center' | 'right'
  letterSpacing: number
  styleRuns: TextStyleRun[]
  paragraphRuns: TextParagraphRun[]
  paragraphBox: { width: number; height: number } | null
  orientation: 'horizontal' | 'vertical'
  warp: TextWarp | null
  missingFonts: string[]
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
  | { type: 'replace-layer'; id: string; layer: EditorLayer }
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
  | { type: 'move-stack-item'; itemType: 'layer' | 'group'; id: string; parentId: string | null; beforeId?: string | null }
  | { type: 'reset-document' }

export type HistoryState = {
  past: DocumentHistoryCommand[]
  present: EditorDocument
  future: DocumentHistoryCommand[]
  groupKey: string | null
}

export type DocumentStatePatch = Partial<EditorDocument>

export type DocumentHistoryCommand = {
  type: 'document-change'
  actionType: DocumentAction['type']
  undo: DocumentStatePatch
  redo: DocumentStatePatch
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
