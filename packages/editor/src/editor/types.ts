export type Position = { x: number; y: number }
export const EDITOR_DOCUMENT_SCHEMA_VERSION = 3 as const
export type BackgroundKind = 'gradient' | 'solid' | 'image' | 'transparent'
export type PatternKind = 'none' | 'grid' | 'dots' | 'waves'
export type ShapeKind = 'rectangle' | 'ellipse' | 'path'
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity'
export type LayerFilters = { brightness: number; contrast: number; saturation: number; hue: number; grayscale: number; sepia: number; invert: number; blur: number }
export type GradientEffectSettings = { enabled: boolean; opacity: number; angle: number; scale: number; style: 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond'; reverse: boolean; blendMode: BlendMode; name: string; gradientType: 'solid' | 'noise'; colorStops: Array<{ color: string; position: number }>; opacityStops: Array<{ opacity: number; position: number }>; roughness: number; randomSeed: number; colorModel: 'rgb' | 'hsb' | 'lab' | 'hsl'; restrictColors: boolean; addTransparency: boolean; min: number[]; max: number[] }
export type PatternEffectSettings = { enabled: boolean; opacity: number; scale: number; blendMode: BlendMode; id: string; name: string; phase: Position; linked: boolean }
export type LayerEffects = {
  dropShadow: { enabled: boolean; color: string; opacity: number; angle: number; distance: number; blur: number; spread: number; blendMode: BlendMode }
  innerShadow: { enabled: boolean; color: string; opacity: number; angle: number; distance: number; blur: number; choke: number; blendMode: BlendMode }
  outerGlow: { enabled: boolean; color: string; opacity: number; size: number; spread: number; blendMode: BlendMode }
  innerGlow: { enabled: boolean; color: string; opacity: number; size: number; choke: number; source: 'edge' | 'center'; blendMode: BlendMode }
  bevel: { enabled: boolean; size: number; depth: number; angle: number; altitude: number; highlightColor: string; highlightOpacity: number; shadowColor: string; shadowOpacity: number; style: 'outer bevel' | 'inner bevel' | 'emboss' | 'pillow emboss' | 'stroke emboss'; direction: 'up' | 'down' }
  satin: { enabled: boolean; color: string; opacity: number; angle: number; distance: number; size: number; invert: boolean; blendMode: BlendMode }
  colorOverlay: { enabled: boolean; color: string; opacity: number; blendMode: BlendMode }
  gradientOverlay: GradientEffectSettings
  patternOverlay: PatternEffectSettings
  stroke: { enabled: boolean; color: string; opacity: number; size: number; position: 'inside' | 'center' | 'outside'; blendMode: BlendMode; fillType: 'color' | 'gradient' | 'pattern'; gradient: Omit<GradientEffectSettings, 'enabled' | 'opacity' | 'blendMode'>; pattern: Omit<PatternEffectSettings, 'enabled' | 'opacity' | 'blendMode'> }
}

export type VectorPath = {
  closed: boolean
  operation: 'exclude' | 'combine' | 'subtract' | 'intersect'
  fillRule: 'even-odd' | 'non-zero'
  knots: Array<{ linked: boolean; in: Position; anchor: Position; out: Position }>
}

export type DocumentPath = {
  id: string
  name: string
  kind: 'work' | 'saved' | 'clipping'
  paths: VectorPath[]
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

export type LayerGeometryTransform = {
  skewX: number
  skewY: number
  perspectiveX: number
  perspectiveY: number
  corners: [Position, Position, Position, Position]
  warp?: { columns: number; rows: number; points: Position[] }
  puppetPins?: Array<{ id: string; source: Position; position: Position }>
  interpolation: 'nearest' | 'bilinear' | 'bicubic'
  referencePoint: Position
}

export type BlendIfSettings = {
  source: number[]
  destination: number[]
  channels: Array<{ source: number[]; destination: number[] }>
}

export type SerializedPsdValue = null | boolean | number | string | SerializedPsdValue[] | { [key: string]: SerializedPsdValue }
export type DocumentGuide = { id: string; direction: 'horizontal' | 'vertical'; position: number }
export type PsdDocumentMetadata = {
  imageResources?: SerializedPsdValue
  linkedFiles?: SerializedPsdValue[]
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
  additionalEffects?: LayerEffects[]
  psdEffectsMetadata?: SerializedPsdValue
  maskAssetId?: string | null
  maskSettings?: LayerMaskSettings
  vectorMask?: VectorMask
  blendIf?: BlendIfSettings
  psdLayerId?: number
  psdPlacedLayer?: SerializedPsdValue
  clipToBelow?: boolean
  groupId?: string | null
  stackOrder?: number
  geometryTransform?: LayerGeometryTransform
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

export type SmartObjectSource = {
  kind: 'embedded' | 'linked'
  fileName: string
  linkedFileId?: string
  mimeType?: string
  path?: string
  lastModified?: number
}

export type AffineTransform = [number, number, number, number, number, number]

export type SmartFilter = {
  id: string
  name: string
  visible: boolean
  opacity: number
  blendMode: BlendMode
  maskAssetId?: string | null
  settings: LayerFilters
  descriptor: SerializedPsdValue
}

export type SmartObjectLayer = BaseLayer & {
  type: 'smart-object'
  assetId: string
  width: number
  height: number
  scale: number
  source: SmartObjectSource
  smartFilters: SmartFilter[]
  transformMatrix?: AffineTransform
  contentHash?: string
  embeddedDocument?: EditorDocument
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

export type AdjustmentLevelsChannel = { shadowInput: number; highlightInput: number; shadowOutput: number; highlightOutput: number; midtoneInput: number }
export type AdjustmentCurve = Array<{ input: number; output: number }>
export type AdjustmentCmyk = { c: number; m: number; y: number; k: number }
export type AdjustmentColorBalance = { cyanRed: number; magentaGreen: number; yellowBlue: number }
export type AdjustmentMixerChannel = { red: number; green: number; blue: number; constant: number }
export type AdjustmentHueChannel = { range: [number, number, number, number]; hue: number; saturation: number; lightness: number }
export type AdjustmentDescriptor =
  | { type: 'brightness/contrast'; brightness: number; contrast: number; meanValue?: number; useLegacy: boolean; labColorOnly: boolean; auto: boolean }
  | { type: 'levels'; rgb?: AdjustmentLevelsChannel; red?: AdjustmentLevelsChannel; green?: AdjustmentLevelsChannel; blue?: AdjustmentLevelsChannel; presetKind?: number; presetFileName?: string }
  | { type: 'curves'; rgb?: AdjustmentCurve; red?: AdjustmentCurve; green?: AdjustmentCurve; blue?: AdjustmentCurve; presetKind?: number; presetFileName?: string }
  | { type: 'exposure'; exposure: number; offset: number; gamma: number; presetKind?: number; presetFileName?: string }
  | { type: 'vibrance'; vibrance: number; saturation: number }
  | { type: 'hue/saturation'; master?: AdjustmentHueChannel; reds?: AdjustmentHueChannel; yellows?: AdjustmentHueChannel; greens?: AdjustmentHueChannel; cyans?: AdjustmentHueChannel; blues?: AdjustmentHueChannel; magentas?: AdjustmentHueChannel; presetKind?: number; presetFileName?: string }
  | { type: 'color balance'; shadows?: AdjustmentColorBalance; midtones?: AdjustmentColorBalance; highlights?: AdjustmentColorBalance; preserveLuminosity: boolean }
  | { type: 'black & white'; reds: number; yellows: number; greens: number; cyans: number; blues: number; magentas: number; useTint: boolean; tintColor: string; presetKind?: number; presetFileName?: string }
  | { type: 'photo filter'; color: string; density: number; preserveLuminosity: boolean }
  | { type: 'channel mixer'; monochrome: boolean; red?: AdjustmentMixerChannel; green?: AdjustmentMixerChannel; blue?: AdjustmentMixerChannel; gray?: AdjustmentMixerChannel; presetKind?: number; presetFileName?: string }
  | { type: 'color lookup'; lookupType?: '3dlut' | 'abstractProfile' | 'deviceLinkProfile'; name?: string; dither: boolean; profile?: number[]; lutFormat?: 'look' | 'cube' | '3dl'; dataOrder?: 'rgb' | 'bgr'; tableOrder?: 'rgb' | 'bgr'; lut3DFileData?: number[]; lut3DFileName?: string; iccPreview?: { size: number; data: number[] } }
  | { type: 'invert' }
  | { type: 'posterize'; levels: number }
  | { type: 'threshold'; level: number }
  | { type: 'gradient map'; name: string; gradientType: 'solid' | 'noise'; dither: boolean; reverse: boolean; method?: 'classic' | 'perceptual' | 'linear' | 'smooth'; smoothness?: number; colorStops?: Array<{ color: string; position: number; midpoint: number }>; opacityStops?: Array<{ opacity: number; position: number; midpoint: number }>; roughness?: number; colorModel?: 'rgb' | 'hsb' | 'lab'; randomSeed?: number; restrictColors?: boolean; addTransparency?: boolean; min?: number[]; max?: number[] }
  | { type: 'selective color'; mode: 'relative' | 'absolute'; reds?: AdjustmentCmyk; yellows?: AdjustmentCmyk; greens?: AdjustmentCmyk; cyans?: AdjustmentCmyk; blues?: AdjustmentCmyk; magentas?: AdjustmentCmyk; whites?: AdjustmentCmyk; neutrals?: AdjustmentCmyk; blacks?: AdjustmentCmyk }

export type AdjustmentLayer = BaseLayer & {
  type: 'adjustment'
  brightness: number
  contrast: number
  saturation: number
  hue: number
  blur: number
  adjustment?: AdjustmentDescriptor
}

export type EditorLayer = ImageLayer | RasterLayer | SmartObjectLayer | TextLayer | ShapeLayer | AdjustmentLayer

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
  assetId?: string
}

export type EditorDocument = {
  schemaVersion: typeof EDITOR_DOCUMENT_SCHEMA_VERSION
  bitDepth: 8 | 16 | 32
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
  paths?: DocumentPath[]
  selectedPathId?: string | null
  guides?: DocumentGuide[]
  psdMetadata?: PsdDocumentMetadata
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
  additionalEffects: LayerEffects[]
  psdEffectsMetadata: SerializedPsdValue | null
  maskAssetId: string | null
  maskSettings: LayerMaskSettings
  vectorMask: VectorMask | null
  blendIf: BlendIfSettings | null
  psdLayerId: number
  psdPlacedLayer: SerializedPsdValue | null
  clipToBelow: boolean
  groupId: string | null
  stackOrder: number
  geometryTransform: LayerGeometryTransform | null
  assetId: string
  padding: number
  scale: number
  cornerRadius: number
  vectorPaths: NonNullable<ShapeLayer['vectorPaths']>
  fillStyle: NonNullable<ShapeLayer['fillStyle']> | null
  strokeStyle: NonNullable<ShapeLayer['strokeStyle']> | null
  adjustment: AdjustmentDescriptor | null
  source: SmartObjectSource
  smartFilters: SmartFilter[]
  transformMatrix: AffineTransform
  contentHash: string
  embeddedDocument: EditorDocument
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
  | { type: 'set-channels'; channels: DocumentChannel[] }
  | { type: 'set-paths'; paths: DocumentPath[]; selectedPathId: string | null }
  | { type: 'replace-document'; document: EditorDocument }
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
  | { type: 'restore'; state: HistoryState }
  | { type: 'discard-future' }

export type EditorDispatch = (
  action: DocumentAction,
  options?: { record?: boolean; groupKey?: string },
) => void
