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
  'magnetic-lasso': partial('Width, contrast, frequency, automatic edge anchors, anchor dragging/deletion, keyboard completion, and cancellation are implemented; complex low-contrast reference masks and stylus modifiers remain to validate.'),
  'magic-wand': partial('Needs contiguous/global controls, sample modes, anti-alias parity, and reference-mask fixtures.'),
  'object-select': partial('Needs stronger non-AI foreground extraction, region modes, and difficult-edge reference fixtures.', 'visually-inaccurate'),
  crop: partial('Needs presets, ratio/resolution controls, straighten integration, overlays, and delete-pixels behavior.'),
  'perspective-crop': partial('Needs grid, numeric controls, source-preserving behavior, and broader interaction fixtures.'),
  eyedropper: partial('Point and 3×3 through 101×101 averages, all-layer and transformed current-raster-layer sampling, plus persistent RGB, HSL, and CMYK samplers are covered; explicit layer targeting and non-raster current-layer sampling remain.'),
  measure: validated('Calibrated multi-line records persist in the document, remain visible on canvas, drive Straighten, and export through the measurement log as CSV.', 'packages/editor/src/editor/measurements.test.ts', 'apps/web/e2e/tool-functional-parity.spec.ts'),
  count: validated('Persistent numbered markers support named color-coded groups, editable labels, canvas overlays, project round-trips, undo, and CSV export.', 'packages/editor/src/editor/counts.test.ts', 'apps/web/e2e/tool-functional-parity.spec.ts'),
  note: validated('Persistent notes expose editable title, content, author, color, and popup state and round-trip as Photoshop text annotations in PSD/PSB.', 'packages/editor/src/editor/psd.test.ts', 'apps/web/e2e/tool-functional-parity.spec.ts'),
  healing: partial('Needs spot/patch modes, diffusion and sampling controls, and stronger texture/luminosity matching.', 'visually-inaccurate'),
  'clone-stamp': partial('Five source slots, aligned sampling, current/current-and-below modes, offsets, rotation, scale, flips, and clipped/inverted source overlays are implemented; cross-layer source retention, pressure, and reference-stroke validation remain.'),
  brush: partial('Needs broader ABR dynamics, reference-stroke parity, mode parity, and large-brush performance fixtures.', 'visually-inaccurate'),
  pencil: partial('Needs mode, auto-erase, preset, and reference-stroke parity.'),
  'color-replacement': partial('Needs limits, sampling, tolerance, anti-alias, and mode parity.'),
  'mixer-brush': partial('Needs wet/load/mix/flow, clean/load, sample-all-layers, and realistic reservoir behavior.', 'visually-inaccurate'),
  'history-brush': partial('Needs history-source selection, mode, opacity, flow, and snapshot parity.'),
  eraser: partial('Needs background/magic eraser variants, mode controls, and erase-to-history behavior.'),
  fill: partial('Needs contiguous/global modes, sample-all-layers, anti-alias parity, and reference-output fixtures.'),
  gradient: partial('Needs editable on-canvas stops, styles, dithering, transparency, presets, and reference-output fixtures.'),
  dodge: partial('Shadows, midtones, highlights, exposure, flow, and protect-tones behavior are implemented; pressure, airbrush timing, and reference-stroke validation remain.'),
  burn: partial('Shadows, midtones, highlights, exposure, flow, and protect-tones behavior are implemented; pressure, airbrush timing, and reference-stroke validation remain.'),
  'pattern-stamp': partial('Needs aligned/impressionist behavior, transform controls, and PAT preset compatibility.'),
  sponge: partial('Saturate, desaturate, vibrance protection, strength, and flow are implemented; pressure, airbrush timing, and reference-stroke validation remain.'),
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
  navigator: validated('The color-managed composition preview, normalized viewport indicator, drag-to-pan interaction, zoom controls, and large-document scaling are browser-covered.', 'apps/web/e2e/navigation-parity.spec.ts', 'apps/web/e2e/visual.spec.ts'),
  histogram: partial('Needs channel modes, cached/uncached levels, high-depth accuracy, and color-space parity.'),
  swatches: partial('Needs ACO/ASE compatibility, groups, sorting, replacement, and complete preset management.', 'round-trip-incompatible'),
  gradients: partial('Needs GRD compatibility and a complete multi-stop/noise gradient editor.', 'round-trip-incompatible'),
  patterns: partial('Needs PAT compatibility, groups, transforms, and complete preset management.', 'round-trip-incompatible'),
  libraries: partial('Local resources exist; style, shape, preset grouping, search, and compatibility formats remain.'),
  plugins: partial('Needs interactive tool/filter ownership, serialization, permissions, conformance, and diagnostics.'),
  info: validated('Persistent RGB, HSL, and CMYK samplers and calibrated measurement records have unit and browser interaction coverage.', 'packages/editor/src/editor/color-samplers.test.ts', 'packages/editor/src/editor/measurements.test.ts', 'apps/web/e2e/tool-functional-parity.spec.ts'),
}

export const missingPhotopeaCapabilities: ReadonlyArray<{ id: string; area: string; assessment: ParityAssessment }> = [
  { id: 'layer-comps', area: 'panel', assessment: missing('No editable Layer Comps panel or state application workflow.') },
  { id: 'variables', area: 'automation', assessment: missing('No variables, CSV datasets, source-image mapping, or dataset export.') },
  { id: 'vanishing-point', area: 'filter', assessment: missing('No perspective-plane editing workspace.') },
  { id: 'blur-gallery', area: 'filter', assessment: missing('No field, iris, tilt-shift, path, or spin blur workspace.') },
  { id: 'liquify', area: 'filter', assessment: missing('No Liquify workspace or freeze/thaw masks.') },
  { id: 'lens-correction', area: 'filter', assessment: missing('No advanced lens correction or adaptive wide-angle workflow.') },
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
  item('file.format-compatibility', 'File > Format compatibility', 'File > Open / Export format behavior', validated('The in-app table labels editable, preserved, converted, rasterized, partial, and unsupported import/export paths.', 'packages/editor/src/editor/format-capabilities.test.ts', 'apps/web/e2e/menu-parity.spec.ts')),
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
  item('image.vectorize', 'Image > Vectorize bitmap', 'Image > Vectorize Bitmap', validated('Monochrome and quantized-color tracing runs locally in a worker with threshold, smoothing, corner, and noise controls and produces editable compound shape paths.', 'packages/editor/src/editor/vectorize.test.ts', 'apps/web/e2e/vectorize-parity.spec.ts')),
  item('layer.new', 'Layer > New layer', 'Layer > New > Layer', validated('Creates and selects one transparent raster layer through the menu, configurable shortcut, or layer context menu.', 'apps/web/e2e/layer-command-parity.spec.ts', 'packages/editor/src/editor/project.test.ts')),
  item('layer.new-group', 'Layer > New group', 'Layer > New > Group', validated('Creates selected-layer groups, empty nested groups, and persistent reorderable group stacks.', 'apps/web/e2e/layer-command-parity.spec.ts', 'packages/editor/src/editor/editor.reducer.test.ts', 'packages/editor/src/editor/project.test.ts', 'packages/editor/src/editor/psd.test.ts')),
  item('layer.duplicate', 'Layer > Duplicate layer or group', 'Layer > Duplicate Layer', validated('Duplicates a layer exactly once and clones complete nested group stacks through menu, shortcut, and context-menu paths.', 'apps/web/e2e/layer-command-parity.spec.ts', 'packages/editor/src/editor/project.test.ts')),
  item('layer.rasterize', 'Layer > Rasterize layer', 'Layer > Rasterize', partial('Rasterization works, but every Photopea source layer and high-depth path still needs coverage.')),
  item('layer.smart-object.convert', 'Layer > Convert to smart object', 'Layer > Smart Object > Convert', implemented('Embeds the selected layer as a smart object.')),
  item('layer.smart-object.replace', 'Layer > Replace smart-object contents', 'Layer > Smart Object > Replace Contents', implemented('Replaces an embedded smart-object source locally.')),
  item('layer.smart-object.relink', 'Layer > Relink smart object', 'Layer > Smart Object > Relink', partial('Relinking works; persistent browser handle refresh still needs validation.')),
  item('layer.smart-object.export', 'Layer > Export smart-object contents', 'Layer > Smart Object > Export Contents', implemented('Exports embedded smart-object bytes locally.')),
  item('layer.effects.clear', 'Layer > Clear layer effects', 'Layer > Layer Style > Clear', implemented('Clears editable effects from the selected layer.')),
  item('layer.delete', 'Layer > Delete layer or group', 'Layer > Delete', validated('Deletes selected layers or complete group stacks through menu, keyboard, and context-menu paths with Undo and Redo restoration.', 'apps/web/e2e/layer-command-parity.spec.ts', 'packages/editor/src/editor/editor.reducer.test.ts')),
  item('select.all', 'Select > All', 'Select > All', validated('Select All is covered across command and raster workflows.', 'packages/editor/src/editor/selection.test.ts', 'apps/web/e2e/command-parity.spec.ts')),
  item('select.deselect', 'Select > Deselect', 'Select > Deselect', validated('Deselect is covered across command and raster workflows.', 'packages/editor/src/editor/selection.test.ts', 'apps/web/e2e/command-parity.spec.ts')),
  item('select.inverse', 'Select > Inverse', 'Select > Inverse', validated('Inverts binary and partial-alpha selection coverage across the complete document through menu and configurable shortcut paths.', 'packages/editor/src/editor/selection.test.ts', 'apps/web/e2e/command-parity.spec.ts')),
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

const importFormats = ['studio', 'psd', 'psb', 'svg', 'png', 'jpeg', 'webp', 'gif', 'tif', 'tiff', 'dng', 'cr2', 'nef', 'arw', 'orf', 'rw2', 'exr', 'hdr', 'heic', 'heif', 'avif', 'ico', 'pdf'] as const
const exportFormats = ['studio', 'png', 'jpeg', 'webp', 'svg', 'psd', 'psb', 'tiff', 'pdf', 'avif', 'gif', 'apng'] as const
const missingImportFormats = ['ai', 'eps', 'xcf', 'kra', 'sketch', 'xd', 'affinity', 'clip-studio'] as const

export const studioFormatOperationParity = [
  ...importFormats.map((format) => item(`format.import.${format}`, `${format.toUpperCase()} import`, `Open ${format.toUpperCase()}`, format === 'psd' || format === 'psb' || format === 'pdf' || ['dng', 'cr2', 'nef', 'arw', 'orf', 'rw2'].includes(format) ? partial(`${format.toUpperCase()} opens locally, but editable structure or full source decoding is incomplete.`) : implemented(`${format.toUpperCase()} opens through a local codec.`))),
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
  ['layer.delete', 'Delete layer or group', 'delete'],
  ['app.command-palette', 'Search commands', 'mod+k'],
  ['app.context-help', 'Contextual help', 'f1'],
  ['selection.quick-mask', 'Toggle Quick Mask', 'q'],
] as const

const validatedShortcutEvidence: Readonly<Record<string, readonly string[]>> = {
  'edit.undo': ['apps/web/e2e/layer-command-parity.spec.ts', 'packages/editor/src/editor/editor.reducer.test.ts'],
  'edit.redo': ['apps/web/e2e/layer-command-parity.spec.ts', 'packages/editor/src/editor/editor.reducer.test.ts'],
  'layer.new': ['apps/web/e2e/layer-command-parity.spec.ts'],
  'layer.duplicate': ['apps/web/e2e/layer-command-parity.spec.ts'],
  'select.inverse': ['apps/web/e2e/command-parity.spec.ts', 'packages/editor/src/editor/selection.test.ts'],
  'view.actual': ['apps/web/e2e/navigation-parity.spec.ts', 'apps/web/e2e/visual.spec.ts'],
  'view.zoom-in': ['apps/web/e2e/navigation-parity.spec.ts'],
  'view.zoom-out': ['apps/web/e2e/navigation-parity.spec.ts'],
}

export const studioShortcutParity = [
  ...shortcutCommands.map((command) => {
    const evidence = validatedShortcutEvidence[command.id]
    return item(`shortcut.${command.id}`, `${command.label} · ${command.defaultBinding}`, `Photopea shortcut for ${command.label}`, evidence
      ? validated(`The ${command.label} binding is assignable and covered through its browser interaction path.`, ...evidence)
      : implemented(`The ${command.label} binding is assignable in Studio.`))
  }),
  ...Object.keys(studioToolParity).flatMap((tool) => shortcutCommands.some((command) => command.id === `tool.${tool}`) ? [] : [item(`shortcut.tool.${tool}`, 'Unassigned', `Photopea shortcut for ${tool}`, partial(`The ${tool} tool is available but has no assignable default shortcut entry.`))]),
  ...explicitShortcutCommands.map(([id, label, binding]) => item(`shortcut.${id}`, `${label} · ${binding}`, `Photopea shortcut for ${label}`, partial(`${label} works with a fixed binding but is not yet exposed in the shortcut editor.`))),
] as const

export const completeParityInventory = [
  ...studioMenuCommandParity,
  ...studioLayerTypeParity,
  ...studioFormatOperationParity,
  ...studioPresetOperationParity,
  ...studioShortcutParity,
] as const
