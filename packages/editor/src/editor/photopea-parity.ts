import type { EditorTool } from '../components/ToolRail'
import type { UtilityPanelId } from './panel-layout'
import { shortcutCommands } from './shortcuts'
import type { AdjustmentDescriptor, FilterGraphKind } from './types'

export type ParityStatus = 'missing' | 'partial' | 'validation-needed' | 'parity-validated' | 'excluded'
export type ParityConcern = 'missing' | 'partial' | 'visually-inaccurate' | 'round-trip-incompatible' | 'too-slow' | 'parity-validated' | 'excluded'
export type ParityAssessment = { status: ParityStatus; concerns: readonly ParityConcern[]; gap: string; evidence: readonly string[] }

const partial = (gap: string, ...concerns: ParityConcern[]): ParityAssessment => ({ status: 'partial', concerns: ['partial', ...concerns], gap, evidence: [] })
const validate = (gap: string): ParityAssessment => ({ status: 'validation-needed', concerns: ['partial'], gap, evidence: [] })
const missing = (gap: string): ParityAssessment => ({ status: 'missing', concerns: ['missing'], gap, evidence: [] })
const validated = (gap: string, ...evidence: string[]): ParityAssessment => ({ status: 'parity-validated', concerns: ['parity-validated'], gap, evidence })

export const studioToolParity: Record<EditorTool, ParityAssessment> = {
  move: partial('Needs complete auto-select, keyboard nudge, mask-only movement, distribute, and modifier parity.'),
  marquee: partial('Needs Photopea option-bar, fixed-size, fixed-ratio, and transform-selection parity.'),
  'ellipse-select': partial('Needs Photopea option-bar, fixed-size, fixed-ratio, and transform-selection parity.'),
  'single-row-select': validated('Exact one-pixel geometry and replace, add, subtract, and intersect behavior are covered independently of document depth.', 'packages/editor/src/editor/selection.test.ts', 'apps/web/e2e/navigation-parity.spec.ts'),
  'single-column-select': validated('Exact one-pixel geometry and replace, add, subtract, and intersect behavior are covered independently of document depth.', 'packages/editor/src/editor/selection.test.ts', 'apps/web/e2e/navigation-parity.spec.ts'),
  lasso: partial('Needs option-bar, smoothing, modifier, and selection-edge parity.'),
  'polygonal-lasso': partial('Needs anchor editing, close/cancel, keyboard, and modifier parity.'),
  'magnetic-lasso': partial('Needs width, contrast, frequency, anchor editing, and stronger edge following.'),
  'magic-wand': partial('Needs contiguous/global controls, sample modes, anti-alias parity, and reference-mask fixtures.'),
  'object-select': partial('Needs stronger non-AI foreground extraction, region modes, and difficult-edge reference fixtures.', 'visually-inaccurate'),
  crop: partial('Needs presets, ratio/resolution controls, straighten integration, overlays, and delete-pixels behavior.'),
  'perspective-crop': partial('Needs grid, numeric controls, source-preserving behavior, and broader interaction fixtures.'),
  eyedropper: partial('Needs point-average sizes, current/all-layer sampling, sampler creation, and color-space readouts.'),
  measure: partial('Needs calibration, persistent records, measurement log, multiple lines, and export.'),
  healing: partial('Needs spot/patch modes, diffusion and sampling controls, and stronger texture/luminosity matching.', 'visually-inaccurate'),
  'clone-stamp': partial('Needs multiple sources, source overlay, flip/offset controls, and source presets.'),
  brush: partial('Needs broader ABR dynamics, reference-stroke parity, mode parity, and large-brush performance fixtures.', 'visually-inaccurate'),
  pencil: partial('Needs mode, auto-erase, preset, and reference-stroke parity.'),
  'color-replacement': partial('Needs limits, sampling, tolerance, anti-alias, and mode parity.'),
  'mixer-brush': partial('Needs wet/load/mix/flow, clean/load, sample-all-layers, and realistic reservoir behavior.', 'visually-inaccurate'),
  'history-brush': partial('Needs history-source selection, mode, opacity, flow, and snapshot parity.'),
  eraser: partial('Needs background/magic eraser variants, mode controls, and erase-to-history behavior.'),
  fill: partial('Needs contiguous/global modes, sample-all-layers, anti-alias parity, and reference-output fixtures.'),
  gradient: partial('Needs editable on-canvas stops, styles, dithering, transparency, presets, and reference-output fixtures.'),
  dodge: partial('Needs shadows/midtones/highlights range, protect-tones, airbrush, and exposure parity.'),
  burn: partial('Needs shadows/midtones/highlights range, protect-tones, airbrush, and exposure parity.'),
  'pattern-stamp': partial('Needs aligned/impressionist behavior, transform controls, and PAT preset compatibility.'),
  sponge: partial('Needs saturate/desaturate modes, vibrance, airbrush, and flow parity.'),
  blur: partial('Needs strength/mode/sample-all-layers controls and reference-output parity.', 'visually-inaccurate'),
  sharpen: partial('Needs protect-detail behavior, strength/mode/sample-all-layers controls, and reference parity.', 'visually-inaccurate'),
  smudge: partial('Needs finger painting, sample-all-layers, strength/mode controls, and wet-media fidelity.', 'visually-inaccurate'),
  text: partial('Needs deterministic complex shaping, CJK, bidi, color fonts, and complete paragraph interaction parity.', 'visually-inaccurate', 'round-trip-incompatible'),
  pen: partial('Needs Free Pen, Curvature Pen, magnetic/freehand options, and complete modifier parity.'),
  'direct-select': partial('Needs full multi-anchor selection, alignment, distribution, conversion, and modifier parity.'),
  'path-select': partial('Needs multi-path selection, alignment, distribution, copy/paste, and transform parity.'),
  warp: partial('Needs local preview commits, denser/custom meshes, split controls, and reference-output parity.', 'visually-inaccurate', 'too-slow'),
  'puppet-warp': partial('Needs local preview commits, mesh controls, pin depth/rotation, rigidity, and reference parity.', 'visually-inaccurate', 'too-slow'),
  rectangle: partial('Needs on-canvas creation by drag and complete live-shape/stroke/fill controls.', 'round-trip-incompatible'),
  ellipse: partial('Needs on-canvas creation by drag and complete live-shape/stroke/fill controls.', 'round-trip-incompatible'),
  hand: validated('Hand panning and temporary Space switching restore the prior tool and are covered in the browser.', 'apps/web/e2e/navigation-parity.spec.ts'),
  zoom: validated('Click, Alt-click, scrubby, menu, shortcut, and temporary modified-Space zoom paths are covered in the browser; window resizing is not applicable to the single-window web workspace.', 'apps/web/e2e/navigation-parity.spec.ts', 'apps/web/e2e/visual.spec.ts'),
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
  'color lookup': partial('Needs broader LUT/profile handling, abstract/device-link parity, and reference fixtures.', 'visually-inaccurate', 'round-trip-incompatible'),
  invert: validate('Implemented; color-mode, high-depth, masking, and round-trip fixtures remain.'),
  posterize: partial('Needs high-depth behavior and reference-output validation.'),
  threshold: partial('Needs histogram interaction and reference-output validation.'),
  'gradient map': partial('Needs full gradient editor, interpolation methods, noise gradients, presets, and reference parity.'),
  'selective color': partial('Needs complete range persistence, presets, high-depth behavior, and reference parity.'),
  'camera raw': partial('Provides local basic controls; it is not a RAW development workspace or full Photopea parameter set.'),
}

export const studioFilterParity: Record<FilterGraphKind, ParityAssessment> = {
  'gaussian-blur': partial('Needs filter-dialog parity, edge behavior, high-depth output, and smart-filter validation.', 'visually-inaccurate'),
  sharpen: partial('Needs Photopea sharpen variants, radius/threshold controls, and reference-output parity.', 'visually-inaccurate'),
  noise: partial('Needs distribution, monochromatic control, high-depth behavior, and reference parity.', 'visually-inaccurate'),
  wave: partial('Needs generators, wavelength, amplitude, scale, type, undefined-area controls, and reference parity.', 'visually-inaccurate'),
  emboss: partial('Needs angle, height, amount, blending behavior, and reference parity.', 'visually-inaccurate'),
  clouds: partial('Needs foreground/background color behavior, difference clouds, high-depth output, and reference parity.', 'visually-inaccurate'),
  pixelate: partial('Needs the remaining Photopea pixelate filters and precise mosaic cell behavior.', 'visually-inaccurate'),
}

export const studioPanelParity: Record<UtilityPanelId, ParityAssessment> = {
  layers: partial('Needs complete Photopea affordances for styles, smart filters, masks, comps, animation, and context menus.', 'round-trip-incompatible'),
  channels: partial('Needs spot channels, calculations, Apply Image workflows, high-depth behavior, and interoperability.', 'round-trip-incompatible'),
  paths: partial('Needs complete path operations, clipping-path options, transforms, and preset interoperability.', 'round-trip-incompatible'),
  history: partial('Needs history source selection, snapshots, non-linear navigation safeguards, and memory controls.'),
  actions: partial('Needs complete command recording plus compatible ATN import/export.', 'round-trip-incompatible'),
  navigator: validate('Implemented; color-managed preview, large-document, and browser interaction fixtures remain.'),
  histogram: partial('Needs channel modes, cached/uncached levels, high-depth accuracy, and color-space parity.'),
  swatches: partial('Needs ACO/ASE compatibility, groups, sorting, replacement, and complete preset management.', 'round-trip-incompatible'),
  gradients: partial('Needs GRD compatibility and a complete multi-stop/noise gradient editor.', 'round-trip-incompatible'),
  patterns: partial('Needs PAT compatibility, groups, transforms, and complete preset management.', 'round-trip-incompatible'),
  libraries: partial('Local resources exist; style, shape, preset grouping, search, and compatibility formats remain.'),
  plugins: partial('Needs interactive tool/filter ownership, serialization, permissions, conformance, and diagnostics.'),
  info: partial('Needs persistent samplers, multiple color spaces, calibrated measurements, and status readouts.'),
}

export const missingPhotopeaCapabilities: ReadonlyArray<{ id: string; area: string; assessment: ParityAssessment }> = [
  { id: 'layer-comps', area: 'panel', assessment: missing('No editable Layer Comps panel or state application workflow.') },
  { id: 'variables', area: 'automation', assessment: missing('No variables, CSV datasets, source-image mapping, or dataset export.') },
  { id: 'vanishing-point', area: 'filter', assessment: missing('No perspective-plane editing workspace.') },
  { id: 'blur-gallery', area: 'filter', assessment: missing('No field, iris, tilt-shift, path, or spin blur workspace.') },
  { id: 'liquify', area: 'filter', assessment: missing('No Liquify workspace or freeze/thaw masks.') },
  { id: 'lens-correction', area: 'filter', assessment: missing('No advanced lens correction or adaptive wide-angle workflow.') },
  { id: 'bitmap-vectorization', area: 'vector', assessment: missing('No local bitmap tracing into editable compound paths.') },
  { id: 'measurement-log', area: 'panel', assessment: missing('No calibrated persistent measurement log or CSV export.') },
  { id: 'notes', area: 'tool', assessment: missing('No persistent notes or annotation tool.') },
  { id: 'count', area: 'tool', assessment: missing('No count tool, groups, labels, or record export.') },
  { id: 'color-sampler', area: 'tool', assessment: missing('No persistent multi-sampler tool and readout workflow.') },
  { id: 'panorama', area: 'automation', assessment: missing('No local panorama alignment, projection, and seam blending.') },
  { id: 'hdr-merge', area: 'automation', assessment: missing('No local exposure fusion or HDR merge workflow.') },
  { id: 'focus-stack', area: 'automation', assessment: missing('No automatic layer alignment and focus blending.') },
  { id: 'raw-development', area: 'workspace', assessment: missing('RAW containers use embedded previews; there is no sensor demosaicing workspace.') },
]

export type ParityInventoryEntry = {
  id: string
  studio: string
  photopea: string
  assessment: ParityAssessment
}

const item = (id: string, studio: string, photopea: string, assessment: ParityAssessment): ParityInventoryEntry => ({ id, studio, photopea, assessment })
const implemented = (detail: string) => validate(`${detail} Functional and visual comparison fixtures still gate a parity-validated claim.`)

/**
 * The built-in menu inventory. IDs are also rendered onto menu items, so browser
 * tests fail when a visible command is added without a corresponding assessment.
 */
export const studioMenuCommandParity = [
  item('file.new', 'File > New document', 'File > New', implemented('Creates a local blank document.')),
  item('file.open', 'File > Open', 'File > Open', implemented('Opens supported local documents.')),
  item('file.place-image', 'File > Place image as layer', 'File > Open & Place', implemented('Places a decoded local image as a layer.')),
  item('file.place-linked', 'File > Place linked smart object', 'File > Open & Place', partial('Linked placement works, but browser file-handle refresh and cross-document parity remain.')),
  item('file.load-font', 'File > Load font', 'File > Open > font', partial('Local font loading works; Adobe font preset and shaping parity remain.')),
  item('file.load-brush', 'File > Load brush tip', 'File > Open > ABR', partial('ABR and local brush loading work; the full ABR descriptor surface remains incomplete.')),
  item('file.plugins', 'File > Manage plugins', 'Window > Plugins', partial('Local declarative plugins work; interactive plugin ownership is still missing.')),
  item('file.desktop-scratch', 'File > Desktop scratch storage', 'More > Local Storage', implemented('Desktop-only scratch storage management is wired.')),
  item('file.save-project', 'File > Save Studio project', 'File > Save as PSD', partial('Studio projects round-trip locally; Photopea uses PSD as its primary editable save path.')),
  item('file.export-assets', 'File > Export assets', 'File > Export Layers', partial('Local slices, layers, artboards, and document export work; naming and preset depth remain.')),
  item('file.print', 'File > Print and PDF', 'File > Print', implemented('Local print and PDF settings are available.')),
  ...(['png', 'jpeg', 'webp', 'svg', 'psd', 'psb', 'tiff', 'pdf', 'avif', 'gif', 'apng'] as const).map((format) => item(`file.export.${format}`, `File > Export as ${format.toUpperCase()}`, `File > Export as ${format.toUpperCase()}`, format === 'psd' || format === 'psb' ? partial('Layered export works, but full PSD/PSB structural round-trip parity remains.') : implemented(`${format.toUpperCase()} export is processed locally.`))),
  item('file.export-artboards', 'File > Export artboards as PNGs', 'File > Export Layers', implemented('Each artboard can be exported locally as PNG.')),
  item('edit.undo', 'Edit > Undo', 'Edit > Undo', validated('Undo is transaction-grouped and covered by reducer and browser interaction tests.', 'packages/editor/src/editor/editor.reducer.test.ts', 'apps/web/e2e/command-parity.spec.ts')),
  item('edit.redo', 'Edit > Redo', 'Edit > Redo', validated('Redo is transaction-grouped and covered by reducer and browser interaction tests.', 'packages/editor/src/editor/editor.reducer.test.ts', 'apps/web/e2e/command-parity.spec.ts')),
  item('edit.transform-again', 'Edit > Transform Again', 'Edit > Transform Again', implemented('Repeats the latest reusable geometry transform.')),
  item('edit.content-aware-fill', 'Edit > Content-Aware Fill', 'Edit > Content-Aware Fill', partial('Local patch matching works; Photopea texture and edge fidelity still need reference validation.')),
  item('edit.shortcuts', 'Edit > Keyboard Shortcuts', 'Edit > Keyboard Shortcuts', partial('Bindings are editable locally; the complete Photopea command set is not yet assignable.')),
  item('edit.scripts', 'Edit > Local Scripts', 'File > Script', partial('Sandboxed local scripts work; Photoshop-compatible document scripting remains missing.')),
  item('image.rotate-cw', 'Image > Rotate canvas clockwise', 'Image > Transform > Rotate 90° CW', implemented('Rotates the complete local document clockwise.')),
  item('image.rotate-ccw', 'Image > Rotate canvas counter-clockwise', 'Image > Transform > Rotate 90° CCW', implemented('Rotates the complete local document counter-clockwise.')),
  item('image.flip-x', 'Image > Flip canvas horizontal', 'Image > Transform > Flip Horizontally', implemented('Flips the complete local document horizontally.')),
  item('image.flip-y', 'Image > Flip canvas vertical', 'Image > Transform > Flip Vertically', implemented('Flips the complete local document vertically.')),
  item('layer.new', 'Layer > New layer', 'Layer > New > Layer', implemented('Creates a transparent raster layer.')),
  item('layer.new-group', 'Layer > New group', 'Layer > New > Group', implemented('Creates a reorderable nested layer group.')),
  item('layer.duplicate', 'Layer > Duplicate layer or group', 'Layer > Duplicate Layer', implemented('Duplicates the selected layer or group.')),
  item('layer.rasterize', 'Layer > Rasterize layer', 'Layer > Rasterize', partial('Rasterization works, but every Photopea source layer and high-depth path still needs coverage.')),
  item('layer.smart-object.convert', 'Layer > Convert to smart object', 'Layer > Smart Object > Convert', implemented('Embeds the selected layer as a smart object.')),
  item('layer.smart-object.replace', 'Layer > Replace smart-object contents', 'Layer > Smart Object > Replace Contents', implemented('Replaces an embedded smart-object source locally.')),
  item('layer.smart-object.relink', 'Layer > Relink smart object', 'Layer > Smart Object > Relink', partial('Relinking works; persistent browser handle refresh still needs validation.')),
  item('layer.smart-object.export', 'Layer > Export smart-object contents', 'Layer > Smart Object > Export Contents', implemented('Exports embedded smart-object bytes locally.')),
  item('layer.effects.clear', 'Layer > Clear layer effects', 'Layer > Layer Style > Clear', implemented('Clears editable effects from the selected layer.')),
  item('layer.delete', 'Layer > Delete layer or group', 'Layer > Delete', implemented('Deletes selected layers or groups with undo.')),
  item('select.all', 'Select > All', 'Select > All', validated('Select All is covered across command and raster workflows.', 'packages/editor/src/editor/selection.test.ts', 'apps/web/e2e/command-parity.spec.ts')),
  item('select.deselect', 'Select > Deselect', 'Select > Deselect', validated('Deselect is covered across command and raster workflows.', 'packages/editor/src/editor/selection.test.ts', 'apps/web/e2e/command-parity.spec.ts')),
  item('select.inverse', 'Select > Inverse', 'Select > Inverse', implemented('Inverts the current pixel selection.')),
  item('select.feather', 'Select > Feather', 'Select > Modify > Feather', partial('Feathering works, but the menu currently exposes a fixed four-pixel value.')),
  item('select.expand', 'Select > Expand', 'Select > Modify > Expand', partial('Expansion works, but the menu currently exposes a fixed four-pixel value.')),
  item('select.contract', 'Select > Contract', 'Select > Modify > Contract', partial('Contraction works, but the menu currently exposes a fixed four-pixel value.')),
  item('select.color-range', 'Select > Color range', 'Select > Color Range', partial('Foreground color-range selection works; dialog, fuzziness, and localized ranges remain.')),
  ...(['shadows', 'midtones', 'highlights'] as const).map((range) => item(`select.luminosity.${range}`, `Select > Luminosity range > ${range}`, 'Select > Color Range > tonal ranges', partial('Local tonal selection works; Photopea range controls and reference masks remain.'))),
  item('select.subject-edges', 'Select > Find subject edges', 'Select > Remove BG / object selection', partial('Non-AI edge extraction works; difficult foreground references remain inaccurate.')),
  item('select.grow', 'Select > Grow', 'Select > Grow', implemented('Grows the selection into neighboring similar pixels.')),
  item('select.similar', 'Select > Similar', 'Select > Similar', implemented('Selects similar pixels throughout the document.')),
  item('select.mask-workspace', 'Select > Select and Mask', 'Select > Select and Mask', partial('The refinement workspace exists; edge decontamination and output-mode parity remain.')),
  item('filter.gaussian-blur', 'Filter > Gaussian blur', 'Filter > Blur > Gaussian Blur', partial('Gaussian blur works; dialog, edge, smart-filter, and high-depth parity remain.')),
  item('filter.sharpen', 'Filter > Sharpen', 'Filter > Sharpen > Sharpen', partial('Sharpen works; variant and reference-output parity remain.')),
  item('filter.grayscale', 'Filter > Grayscale', 'Image > Adjustments > Black & White', partial('Destructive grayscale works; Photopea adjustment controls remain deeper.')),
  item('filter.sepia', 'Filter > Sepia', 'Image > Adjustments / filters', implemented('A local destructive sepia preset is available.')),
  item('filter.invert', 'Filter > Invert', 'Image > Adjustments > Invert', implemented('Destructive inversion is available.')),
  item('filter.reset', 'Filter > Reset layer filters', 'Filter > clear smart filters', partial('Studio filter reset works; Photopea smart-filter stack semantics remain deeper.')),
  item('view.zoom-in', 'View > Zoom in', 'View > Zoom In', validated('Zoom in has menu, button, shortcut, and browser interaction coverage.', 'apps/web/e2e/navigation-parity.spec.ts')),
  item('view.zoom-out', 'View > Zoom out', 'View > Zoom Out', validated('Zoom out has menu, button, shortcut, and browser interaction coverage.', 'apps/web/e2e/navigation-parity.spec.ts')),
  item('view.actual', 'View > 100%', 'View > Pixel to Pixel', validated('Actual-pixel zoom has menu, button, shortcut, and browser coverage.', 'apps/web/e2e/navigation-parity.spec.ts', 'apps/web/e2e/visual.spec.ts')),
  ...(['properties', 'layers', 'timeline'] as const).map((panel) => item(`view.panel.${panel}`, `View > Panels > ${panel}`, `Window > ${panel}`, implemented(`The ${panel} surface can be shown and hidden.`))),
  item('view.workspace.apply', 'View > Workspace > built-in or saved workspace', 'Window > Workspace', partial('Workspace application works; restoration and docking edge cases remain.')),
  item('view.workspace.save', 'View > Save current workspace', 'Window > Workspace > New Workspace', implemented('Custom workspace layouts persist locally.')),
  item('help.commands', 'Help > Search commands', 'Edit > Search', implemented('The local command palette searches exposed commands.')),
  item('help.context', 'Help > Contextual help', 'Help / tool hints', implemented('Local contextual help and tool hints are available.')),
  item('help.diagnostics', 'Help > Export diagnostics', 'More > report a bug', implemented('Privacy-filtered diagnostics export locally.')),
] as const

export type StudioMenuCommandId = (typeof studioMenuCommandParity)[number]['id']

export const studioLayerTypeParity = [
  item('layer.pixel', 'Raster layer', 'Pixel layer', implemented('Editable transparent raster layers are supported.')),
  item('layer.image', 'Image layer', 'Placed pixel layer', partial('Image layers remain a Studio-specific placed-image representation until rasterized.')),
  item('layer.text', 'Text layer', 'Text layer', partial('Editable text exists; shaping, vertical layout, path text, and round-trip gaps remain.')),
  item('layer.shape.rectangle', 'Rectangle shape layer', 'Rectangle shape layer', partial('Editable rectangles exist; complete live-shape properties remain.')),
  item('layer.shape.ellipse', 'Ellipse shape layer', 'Ellipse shape layer', partial('Editable ellipses exist; complete live-shape properties remain.')),
  item('layer.shape.path', 'Compound path shape layer', 'Shape layer', partial('Compound editable paths exist; custom shape and round-trip depth remain.')),
  item('layer.smart-object', 'Smart-object layer', 'Smart Object', partial('Embedded and linked sources work; shared-source and nested-document parity remain.')),
  item('layer.group', 'Layer group', 'Folder', implemented('Nested, reorderable groups with pass-through behavior are supported.')),
  ...Object.keys(studioAdjustmentParity).map((kind) => item(`layer.adjustment.${kind}`, `${kind} adjustment layer`, `${kind} adjustment layer`, studioAdjustmentParity[kind as AdjustmentType])),
  item('layer.fill.solid', 'Not implemented', 'Solid Color fill layer', missing('Solid Color fill layers are not represented as editable fill layers.')),
  item('layer.fill.gradient', 'Not implemented', 'Gradient fill layer', missing('Gradient fill layers are not represented as editable fill layers.')),
  item('layer.fill.pattern', 'Not implemented', 'Pattern fill layer', missing('Pattern fill layers are not represented as editable fill layers.')),
  item('layer.video', 'Not implemented', 'Video layer', missing('Video layers and a deterministic local media timeline are not implemented.')),
] as const

const importFormats = ['studio', 'psd', 'svg', 'png', 'jpeg', 'webp', 'gif', 'tif', 'tiff', 'dng', 'cr2', 'nef', 'arw', 'orf', 'rw2', 'exr', 'hdr', 'heic', 'heif', 'avif', 'ico', 'pdf'] as const
const exportFormats = ['studio', 'png', 'jpeg', 'webp', 'svg', 'psd', 'psb', 'tiff', 'pdf', 'avif', 'gif', 'apng'] as const
const missingImportFormats = ['ai', 'eps', 'xcf', 'kra', 'sketch', 'xd', 'affinity', 'clip-studio'] as const

export const studioFormatOperationParity = [
  ...importFormats.map((format) => item(`format.import.${format}`, `${format.toUpperCase()} import`, `Open ${format.toUpperCase()}`, format === 'psd' || format === 'pdf' || ['dng', 'cr2', 'nef', 'arw', 'orf', 'rw2'].includes(format) ? partial(`${format.toUpperCase()} opens locally, but editable structure or full source decoding is incomplete.`) : implemented(`${format.toUpperCase()} opens through a local codec.`))),
  ...exportFormats.map((format) => item(`format.export.${format}`, `${format.toUpperCase()} export`, `Export ${format.toUpperCase()}`, format === 'psd' || format === 'psb' || format === 'svg' || format === 'pdf' ? partial(`${format.toUpperCase()} export works, but complete editable structural parity remains.`) : implemented(`${format.toUpperCase()} export is processed locally.`))),
  ...missingImportFormats.map((format) => item(`format.import.${format}`, 'Not implemented', `Open ${format.toUpperCase()}`, missing(`${format.toUpperCase()} import is not implemented.`))),
] as const

export const studioPresetOperationParity = [
  item('preset.brush.abr-import', 'Import ABR brushes', 'Load ABR', partial('Sampled ABR tips and some dynamics import; full computed-brush descriptors remain.')),
  item('preset.brush.studio-roundtrip', 'Import/export Studio brush', 'Load/save brush preset', implemented('Portable Studio brush tips and dynamics round-trip locally.')),
  item('preset.font.import', 'Load TTF, OTF, WOFF, WOFF2', 'Load font', partial('Local fonts load and persist; shaping and Adobe font-library parity remain.')),
  item('preset.swatch.local', 'Create/remove local swatches', 'Swatches preset operations', partial('Local swatches persist; ACO and ASE import/export and grouping remain.')),
  item('preset.gradient.local', 'Create/remove local gradients', 'Gradient preset operations', partial('Local gradients persist; GRD compatibility and full gradient editing remain.')),
  item('preset.pattern.studio-roundtrip', 'Import/export Studio patterns', 'Pattern preset operations', partial('Bitmap and generated patterns persist; PAT compatibility remains.')),
  item('preset.shape.studio-roundtrip', 'Import/export Studio shapes', 'Custom Shape preset operations', partial('Studio custom shapes round-trip; CSH compatibility remains.')),
  item('preset.action.local', 'Create/run local actions', 'Action preset operations', partial('Local action steps run; complete recording and ATN compatibility remain.')),
  item('preset.workspace.local', 'Create/apply/delete workspace', 'Workspace preset operations', partial('Local workspaces persist; complete docking restoration parity remains.')),
  item('preset.tool.local', 'Create/apply/delete tool preset', 'Tool Preset operations', partial('Local tool settings persist; broader option and preset compatibility remain.')),
  item('preset.filter.local', 'Create/apply filter graph preset', 'Filter preset operations', partial('Local graph presets persist; Photopea filter parameter depth remains.')),
  item('preset.export.local', 'Create/apply export preset', 'Export preset operations', implemented('Local export settings can be saved and reapplied.')),
  item('preset.color-profile.import', 'Load ICC or ICM profile', 'Assign / convert profile', partial('Local profiles load; complete proofing and rendering-intent validation remain.')),
  item('preset.color-lookup.import', 'Load CUBE, 3DL, or LOOK LUT', 'Color Lookup preset', partial('Local LUTs load; abstract and device-link profile parity remains.')),
] as const

const explicitShortcutCommands = [
  ['select.all', 'Select all', 'mod+a'],
  ['select.deselect', 'Deselect', 'mod+d'],
  ['select.inverse', 'Invert selection', 'mod+shift+i'],
  ['layer.delete', 'Delete layer or group', 'delete'],
  ['app.command-palette', 'Search commands', 'mod+k'],
  ['app.context-help', 'Contextual help', 'f1'],
  ['selection.quick-mask', 'Toggle Quick Mask', 'q'],
] as const

export const studioShortcutParity = [
  ...shortcutCommands.map((command) => item(`shortcut.${command.id}`, `${command.label} · ${command.defaultBinding}`, `Photopea shortcut for ${command.label}`, implemented(`The ${command.label} binding is assignable in Studio.`))),
  ...Object.keys(studioToolParity).filter((tool) => !shortcutCommands.some((command) => command.id === `tool.${tool}`)).map((tool) => item(`shortcut.tool.${tool}`, 'Unassigned', `Photopea shortcut for ${tool}`, partial(`The ${tool} tool is available but has no assignable default shortcut entry.`))),
  ...explicitShortcutCommands.map(([id, label, binding]) => item(`shortcut.${id}`, `${label} · ${binding}`, `Photopea shortcut for ${label}`, partial(`${label} works with a fixed binding but is not yet exposed in the shortcut editor.`))),
] as const

export const completeParityInventory = [
  ...studioMenuCommandParity,
  ...studioLayerTypeParity,
  ...studioFormatOperationParity,
  ...studioPresetOperationParity,
  ...studioShortcutParity,
] as const
