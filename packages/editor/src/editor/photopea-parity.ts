import type { EditorTool } from '../components/ToolRail'
import type { UtilityPanelId } from './panel-layout'
import type { AdjustmentDescriptor, FilterGraphKind } from './types'

export type ParityStatus = 'missing' | 'partial' | 'validation-needed' | 'parity-validated' | 'excluded'
export type ParityAssessment = { status: ParityStatus; gap: string }

const partial = (gap: string): ParityAssessment => ({ status: 'partial', gap })
const validate = (gap: string): ParityAssessment => ({ status: 'validation-needed', gap })

export const studioToolParity: Record<EditorTool, ParityAssessment> = {
  move: partial('Needs complete auto-select, keyboard nudge, mask-only movement, distribute, and modifier parity.'),
  marquee: partial('Needs Photopea option-bar, fixed-size, fixed-ratio, and transform-selection parity.'),
  'ellipse-select': partial('Needs Photopea option-bar, fixed-size, fixed-ratio, and transform-selection parity.'),
  'single-row-select': validate('Implemented; interaction, high-depth, modifier, and round-trip fixtures are missing.'),
  'single-column-select': validate('Implemented; interaction, high-depth, modifier, and round-trip fixtures are missing.'),
  lasso: partial('Needs option-bar, smoothing, modifier, and selection-edge parity.'),
  'polygonal-lasso': partial('Needs anchor editing, close/cancel, keyboard, and modifier parity.'),
  'magnetic-lasso': partial('Needs width, contrast, frequency, anchor editing, and stronger edge following.'),
  'magic-wand': partial('Needs contiguous/global controls, sample modes, anti-alias parity, and lower commit latency.'),
  'object-select': partial('Needs stronger non-AI foreground extraction, region modes, and lower commit latency.'),
  crop: partial('Needs presets, ratio/resolution controls, straighten integration, overlays, and delete-pixels behavior.'),
  'perspective-crop': partial('Needs grid, numeric controls, source-preserving behavior, and broader interaction fixtures.'),
  eyedropper: partial('Needs point-average sizes, current/all-layer sampling, sampler creation, and color-space readouts.'),
  measure: partial('Needs calibration, persistent records, measurement log, multiple lines, and export.'),
  healing: partial('Needs spot/patch modes, diffusion and sampling controls, and stronger texture/luminosity matching.'),
  'clone-stamp': partial('Needs multiple sources, source overlay, flip/offset controls, and source presets.'),
  brush: partial('Needs broader ABR dynamics, reference-stroke parity, mode parity, and large-brush performance fixtures.'),
  pencil: partial('Needs mode, auto-erase, preset, and reference-stroke parity.'),
  'color-replacement': partial('Needs limits, sampling, tolerance, anti-alias, and mode parity.'),
  'mixer-brush': partial('Needs wet/load/mix/flow, clean/load, sample-all-layers, and realistic reservoir behavior.'),
  'history-brush': partial('Needs history-source selection, mode, opacity, flow, and snapshot parity.'),
  eraser: partial('Needs background/magic eraser variants, mode controls, and erase-to-history behavior.'),
  fill: partial('Needs contiguous/global modes, sample-all-layers, anti-alias parity, and incremental execution.'),
  gradient: partial('Needs editable on-canvas stops, styles, dithering, transparency, presets, and incremental commit.'),
  dodge: partial('Needs shadows/midtones/highlights range, protect-tones, airbrush, and exposure parity.'),
  burn: partial('Needs shadows/midtones/highlights range, protect-tones, airbrush, and exposure parity.'),
  'pattern-stamp': partial('Needs aligned/impressionist behavior, transform controls, and PAT preset compatibility.'),
  sponge: partial('Needs saturate/desaturate modes, vibrance, airbrush, and flow parity.'),
  blur: partial('Needs strength/mode/sample-all-layers controls and reference-output parity.'),
  sharpen: partial('Needs protect-detail behavior, strength/mode/sample-all-layers controls, and reference parity.'),
  smudge: partial('Needs finger painting, sample-all-layers, strength/mode controls, and wet-media fidelity.'),
  text: partial('Needs deterministic complex shaping, CJK, bidi, color fonts, and complete paragraph interaction parity.'),
  pen: partial('Needs Free Pen, Curvature Pen, magnetic/freehand options, and complete modifier parity.'),
  'direct-select': partial('Needs full multi-anchor selection, alignment, distribution, conversion, and modifier parity.'),
  'path-select': partial('Needs multi-path selection, alignment, distribution, copy/paste, and transform parity.'),
  warp: partial('Needs local preview commits, denser/custom meshes, split controls, and reference-output parity.'),
  'puppet-warp': partial('Needs local preview commits, mesh controls, pin depth/rotation, rigidity, and reference parity.'),
  rectangle: partial('Needs on-canvas creation by drag and complete live-shape/stroke/fill controls.'),
  ellipse: partial('Needs on-canvas creation by drag and complete live-shape/stroke/fill controls.'),
  hand: validate('Core panning is implemented; temporary Space switching and browser interaction fixtures remain.'),
  zoom: partial('Needs scrubby/tool-area zoom, resize-windows behavior, temporary switching, and shortcut parity.'),
}

type AdjustmentType = AdjustmentDescriptor['type']

export const studioAdjustmentParity: Record<AdjustmentType, ParityAssessment> = {
  'brightness/contrast': partial('Needs complete legacy/auto/Lab behavior and reference-output validation.'),
  levels: partial('Needs auto options, per-channel histogram interaction, eyedroppers, presets, and high-depth parity.'),
  curves: partial('Needs pencil/smoothing, eyedroppers, auto options, channel overlays, presets, and high-depth parity.'),
  exposure: partial('Needs preset and high-depth reference-output parity.'),
  vibrance: partial('Needs protected-skin behavior and reference-output parity.'),
  'hue/saturation': partial('Needs complete color-range editing, eyedroppers, colorize, presets, and reference parity.'),
  'color balance': partial('Needs tone-range and preserve-luminosity reference parity.'),
  'black & white': partial('Needs targeted adjustment, auto, presets, tint, and reference parity.'),
  'photo filter': partial('Needs filter preset library, color behavior, and reference parity.'),
  'channel mixer': partial('Needs presets, monochrome behavior, validation, and high-depth parity.'),
  'color lookup': partial('Needs broader LUT/profile handling, abstract/device-link parity, and reference fixtures.'),
  invert: validate('Implemented; color-mode, high-depth, masking, and round-trip fixtures remain.'),
  posterize: partial('Needs high-depth behavior and reference-output validation.'),
  threshold: partial('Needs histogram interaction and reference-output validation.'),
  'gradient map': partial('Needs full gradient editor, interpolation methods, noise gradients, presets, and reference parity.'),
  'selective color': partial('Needs complete range persistence, presets, high-depth behavior, and reference parity.'),
  'camera raw': partial('Provides local basic controls; it is not a RAW development workspace or full Photopea parameter set.'),
}

export const studioFilterParity: Record<FilterGraphKind, ParityAssessment> = {
  'gaussian-blur': partial('Needs filter-dialog parity, edge behavior, high-depth output, and smart-filter validation.'),
  sharpen: partial('Needs Photopea sharpen variants, radius/threshold controls, and reference-output parity.'),
  noise: partial('Needs distribution, monochromatic control, high-depth behavior, and reference parity.'),
  wave: partial('Needs generators, wavelength, amplitude, scale, type, undefined-area controls, and reference parity.'),
  emboss: partial('Needs angle, height, amount, blending behavior, and reference parity.'),
  clouds: partial('Needs foreground/background color behavior, difference clouds, high-depth output, and reference parity.'),
  pixelate: partial('Needs the remaining Photopea pixelate filters and precise mosaic cell behavior.'),
}

export const studioPanelParity: Record<UtilityPanelId, ParityAssessment> = {
  layers: partial('Needs complete Photopea affordances for styles, smart filters, masks, comps, animation, and context menus.'),
  channels: partial('Needs spot channels, calculations, Apply Image workflows, high-depth behavior, and interoperability.'),
  paths: partial('Needs complete path operations, clipping-path options, transforms, and preset interoperability.'),
  history: partial('Needs history source selection, snapshots, non-linear navigation safeguards, and memory controls.'),
  actions: partial('Needs complete command recording plus compatible ATN import/export.'),
  navigator: validate('Implemented; color-managed preview, large-document, and browser interaction fixtures remain.'),
  histogram: partial('Needs channel modes, cached/uncached levels, high-depth accuracy, and color-space parity.'),
  swatches: partial('Needs ACO/ASE compatibility, groups, sorting, replacement, and complete preset management.'),
  gradients: partial('Needs GRD compatibility and a complete multi-stop/noise gradient editor.'),
  patterns: partial('Needs PAT compatibility, groups, transforms, and complete preset management.'),
  libraries: partial('Local resources exist; style, shape, preset grouping, search, and compatibility formats remain.'),
  plugins: partial('Needs interactive tool/filter ownership, serialization, permissions, conformance, and diagnostics.'),
  info: partial('Needs persistent samplers, multiple color spaces, calibrated measurements, and status readouts.'),
}

export const missingPhotopeaCapabilities: ReadonlyArray<{ id: string; area: string; assessment: ParityAssessment }> = [
  { id: 'layer-comps', area: 'panel', assessment: { status: 'missing', gap: 'No editable Layer Comps panel or state application workflow.' } },
  { id: 'variables', area: 'automation', assessment: { status: 'missing', gap: 'No variables, CSV datasets, source-image mapping, or dataset export.' } },
  { id: 'vanishing-point', area: 'filter', assessment: { status: 'missing', gap: 'No perspective-plane editing workspace.' } },
  { id: 'blur-gallery', area: 'filter', assessment: { status: 'missing', gap: 'No field, iris, tilt-shift, path, or spin blur workspace.' } },
  { id: 'liquify', area: 'filter', assessment: { status: 'missing', gap: 'No Liquify workspace or freeze/thaw masks.' } },
  { id: 'lens-correction', area: 'filter', assessment: { status: 'missing', gap: 'No advanced lens correction or adaptive wide-angle workflow.' } },
  { id: 'bitmap-vectorization', area: 'vector', assessment: { status: 'missing', gap: 'No local bitmap tracing into editable compound paths.' } },
  { id: 'measurement-log', area: 'panel', assessment: { status: 'missing', gap: 'No calibrated persistent measurement log or CSV export.' } },
  { id: 'notes', area: 'tool', assessment: { status: 'missing', gap: 'No persistent notes or annotation tool.' } },
  { id: 'count', area: 'tool', assessment: { status: 'missing', gap: 'No count tool, groups, labels, or record export.' } },
  { id: 'color-sampler', area: 'tool', assessment: { status: 'missing', gap: 'No persistent multi-sampler tool and readout workflow.' } },
  { id: 'panorama', area: 'automation', assessment: { status: 'missing', gap: 'No local panorama alignment, projection, and seam blending.' } },
  { id: 'hdr-merge', area: 'automation', assessment: { status: 'missing', gap: 'No local exposure fusion or HDR merge workflow.' } },
  { id: 'focus-stack', area: 'automation', assessment: { status: 'missing', gap: 'No automatic layer alignment and focus blending.' } },
  { id: 'raw-development', area: 'workspace', assessment: { status: 'missing', gap: 'RAW containers use embedded previews; there is no sensor demosaicing workspace.' } },
]
