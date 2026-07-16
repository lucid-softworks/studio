# Photopea parity matrix

Last audited: 2026-07-16

This is the living comparison between Photopea's core offline editor and Studio. The typed assessments for Studio tools, adjustments, filters, panels, and known missing workflows live in [`photopea-parity.ts`](../packages/editor/src/editor/photopea-parity.ts) and are checked by automated tests. This document covers the wider menu, layer, format, preset, shortcut, and workflow surface.

Photopea references:

- [Photopea manual](https://www.photopea.com/learn/)
- [Adjustments and filters](https://www.photopea.com/learn/adjustments-filters)
- [Smart objects](https://www.photopea.com/learn/smart-objects)
- [Variables](https://www.photopea.com/learn/variables)
- [Layer comps](https://www.photopea.com/learn/index.php?page=layer-comps)
- [Vanishing Point](https://www.photopea.com/learn/vanishing-point)
- [Blur Gallery](https://www.photopea.com/learn/blur-gallery)

## Statuses

| Status | Meaning |
| --- | --- |
| Missing | No usable Studio implementation. |
| Partial | A usable implementation exists, but known behavior or compatibility is missing. |
| Validation needed | The expected core behavior exists, but the parity fixtures are incomplete. |
| Parity validated | Reference behavior, persistence, compatibility, performance, and tests meet the roadmap definition. |
| Excluded | Intentionally outside Studio's local-only, no-AI product boundaries. |

No capability should move to **Parity validated** without linking to its interaction, visual, persistence, and compatibility evidence.

Typed assessments also carry one or more searchable concerns: `missing`, `partial`, `visually-inaccurate`, `round-trip-incompatible`, `too-slow`, `parity-validated`, or `excluded`. A workflow status describes delivery state; concerns describe why it has not reached parity.

## Parity-validated slices

These bounded workflows are at 100% of the Photopea behavior applicable to Studio's local browser and desktop workspace. Each typed claim contains machine-checked test paths in its `evidence` field.

| Workflow | Status | Evidence |
| --- | --- | --- |
| Undo and Redo | Parity validated | Transaction grouping and raster restoration in [`editor.reducer.test.ts`](../packages/editor/src/editor/editor.reducer.test.ts) and [`command-parity.spec.ts`](../apps/web/e2e/command-parity.spec.ts). |
| Select All and Deselect | Parity validated | Complete-document selection and clearing in [`selection.test.ts`](../packages/editor/src/editor/selection.test.ts) and [`command-parity.spec.ts`](../apps/web/e2e/command-parity.spec.ts). |
| Single Row Marquee | Parity validated | Exact one-pixel geometry plus replace, add, subtract, and intersect coverage in [`selection.test.ts`](../packages/editor/src/editor/selection.test.ts) and [`navigation-parity.spec.ts`](../apps/web/e2e/navigation-parity.spec.ts). |
| Single Column Marquee | Parity validated | Exact one-pixel geometry plus replace, add, subtract, and intersect coverage in [`selection.test.ts`](../packages/editor/src/editor/selection.test.ts) and [`navigation-parity.spec.ts`](../apps/web/e2e/navigation-parity.spec.ts). |
| Hand tool | Parity validated | Direct panning and temporary Space switching with prior-tool restoration in [`navigation-parity.spec.ts`](../apps/web/e2e/navigation-parity.spec.ts). |
| Zoom tool | Parity validated | Click, Alt-click, scrubby drag, menu, shortcut, temporary modified-Space, and visual-scale coverage in [`navigation-parity.spec.ts`](../apps/web/e2e/navigation-parity.spec.ts) and [`visual.spec.ts`](../apps/web/e2e/visual.spec.ts). |
| Navigator panel | Parity validated | Color-managed preview, visible viewport, drag-to-pan, zoom controls, and large-document scaling in [`navigation-parity.spec.ts`](../apps/web/e2e/navigation-parity.spec.ts) and [`visual.spec.ts`](../apps/web/e2e/visual.spec.ts). |

## Menus and commands

| Photopea area | Studio coverage | Status | Principal remaining gap |
| --- | --- | --- | --- |
| File: new, open, save | New/open and Studio project save | Partial | Save-in-source-format, Save As semantics, recent/storage workflows, and compatibility prompts. |
| File: place embedded / linked | Image placement and linked smart-object placement | Partial | Transform-on-place, shared linked sources, file-handle permissions, update/relink edge cases. |
| File: export | PNG, JPEG, WebP, AVIF, SVG, PSD, PSB, TIFF, PDF, GIF, APNG and asset workspace | Partial | Per-format option depth, metadata controls, optimized export preview, and editable fidelity. |
| File: automate / scripts | Local actions, batch worker and sandboxed scripts | Partial | Photopea/Photoshop-like scripting surface, complete recordable commands, ATN compatibility. |
| File: print | Local print/PDF dialog | Partial | Printer setup parity, color-managed print preview, separations, and platform validation. |
| Edit: undo / redo | Typed document history and raster-region history | Parity validated | Transaction grouping and raster pixel restoration are covered by unit and browser evidence. |
| Edit: cut / copy / paste | Pixel and image clipboard paths | Partial | Layers, vectors, text, masks, paths, cross-document placement, and external application fidelity. |
| Edit: fill / stroke | Paint Bucket, gradients, path fill/stroke | Partial | Dialog-level fill/stroke behavior, pattern/history/content options, blending and selection parity. |
| Edit: transform | Move overlay, free transform, transform again, distort, perspective, warp | Partial | Complete numeric controls, repeat/duplicate semantics, local previews, modifier and reference-output parity. |
| Edit: keyboard shortcuts | Editable shortcut map | Partial | Commands without bindings, full Photopea defaults, conflicts, temporary tools, menu mnemonics. |
| Image: mode / depth | RGB, grayscale, indexed, CMYK metadata and 8/16/32 settings | Partial | End-to-end high-depth processing, Lab/duotone/multichannel, conversion dialogs and reference color output. |
| Image: adjustments | 17 typed adjustment descriptors | Partial | Destructive variants, complete parameters, presets, high-depth behavior and reference-output parity. |
| Image: size / canvas size | Document properties and content-aware scale | Partial | Full resampling dialog, constrain/proportions, canvas anchors, trim/reveal-all and automation parity. |
| Image: rotation / flip | Canvas rotate and flip commands | Validation needed | Metadata, artboard, guide, path, animation, high-depth and round-trip fixtures. |
| Layer: create / duplicate / delete / group | Layer and nested group operations | Validation needed | Context-menu and keyboard parity plus stress/round-trip coverage. |
| Layer: style | Editable primary layer effects and clear effects | Partial | Full parameter depth, multiple instances, ASL presets, copy/paste/scale style commands. |
| Layer: masks | Raster and vector masks | Partial | All reveal/hide/from-transparency commands, linking/movement details, Apply Image and calculations. |
| Layer: smart objects / filters | Embedded and linked smart objects with filter stacks | Partial | Shared-source behavior, complete smart-filter dialogs/masks/blending, nested compatibility. |
| Layer: arrange / align / distribute | Ordering, alignment, smart guides and snapping | Partial | Complete distribute/spacing/reference commands and mask/path target behavior. |
| Layer: layer comps | PSD descriptor preservation only | Missing | Editable panel and create/apply/update/state workflow. |
| Select: all / deselect | Available | Parity validated | Complete-document selection and clearing are covered by unit and browser evidence. |
| Select: inverse | Available | Validation needed | Color-mode, high-depth, artboard and interaction fixtures. |
| Select: modify | Fixed feather/expand/contract plus grow/similar | Partial | Dialog values, border, smooth, transform selection, save/load parity. |
| Select: color / luminosity / subject edges | Local non-AI implementations | Partial | Sampling options, fuzziness/range UI, difficult-edge quality and reference masks. |
| Select: Select and Mask | Dedicated workspace | Partial | Tool depth, views, output modes, edge brush and decontamination fidelity. |
| Filter: blur / sharpen / noise / distort / stylize / render / pixelate | Seven-node filter graph | Partial | Most individual filters and most Photopea dialog parameters are absent. |
| Filter: Camera Raw-style controls | Adjustment layer with basic local controls | Partial | RAW development, local adjustment tools, curves/detail/optics/color mixer and preset depth. |
| Filter: Liquify | None | Missing | Full local Liquify workspace. |
| Filter: Vanishing Point | None | Missing | Perspective-plane workspace and perspective-aware editing. |
| Filter: Blur Gallery | None | Missing | Field, iris, tilt-shift, path and spin blur workspace. |
| View: zoom / pan / rotate / split | Zoom, hand, rotate view, navigator and linked split views | Partial | Complete fit modes, temporary tools, screen mode and interaction parity. |
| View: rulers / guides / grid / snapping | Rulers, guides, layouts, smart guides and configurable grid | Partial | Every Photopea guide command, guide locking/clearing, visibility shortcuts and artboard edge cases. |
| Window: panels / workspaces | Resizable docks, multiple/floating stacks and saved workspaces | Partial | Missing Photopea panels, focus behavior, menu parity and exhaustive restoration tests. |
| Help / diagnostics | Command search, contextual help and local diagnostic export | Partial | Complete feature help, searchable parameter docs, compatibility report links and localization. |

## Tools

The canonical 41-tool assessment is `studioToolParity`. Current summary:

| Family | Status | Principal remaining gap |
| --- | --- | --- |
| Move and transform | Partial | Auto-select/nudge/mask movement depth, local warp previews, complete modifier parity. |
| Marquee and lasso selections | Partial | Option bars, fixed sizes/ratios, magnetic controls, anchor editing and reference masks. |
| Magic Wand and Object Select | Partial | Quality, sample modes, anti-aliasing and incremental execution. |
| Crop and perspective crop | Partial | Presets, overlays, resolution/delete-pixels controls and source-preserving behavior. |
| Eyedropper and measure | Partial | Sample sizes/layers, persistent samplers, calibration and measurement records. |
| Brush, pencil and eraser | Partial | Broader ABR behavior, mode/preset/reference-stroke parity and eraser variants. |
| Clone and healing | Partial | Source management/overlay and stronger healing/patch behavior. |
| Mixer, history and color replacement | Partial | Complete reservoirs, history sources, sampling/limits/tolerance behavior. |
| Fill and gradient | Partial | Editable gradient UI, preset depth and main-thread commit latency. |
| Dodge, burn, sponge, blur, sharpen and smudge | Partial | Range/mode/sample-all-layers/protect-detail and reference-output parity. |
| Type | Partial | Deterministic shaping, complex scripts, bidi, CJK and color fonts. |
| Pen and path selection | Partial | Free/Curvature Pen, complete anchor operations, multi-selection and transforms. |
| Shapes | Partial | Drag-to-create and complete live shapes beyond rectangle/ellipse. |
| Hand and zoom | Parity validated | Direct and temporary navigation, scrubby zoom, menu commands, shortcuts, and visual scaling are covered by automated browser evidence. |
| Notes, Count and Color Sampler | Missing | Tools and persistent panels/records do not exist. |

## Panels

The canonical 13-panel assessment is `studioPanelParity`.

| Panel family | Status | Notes |
| --- | --- | --- |
| Layers, Channels, Paths, History, Actions | Partial | Core panels exist; advanced operations and compatibility remain. |
| Navigator | Parity validated | Preview, visible viewport, drag-to-pan, zoom, color, and large-document behavior have automated evidence. |
| Histogram and Info | Partial | High-depth/color accuracy and persistent samplers remain. |
| Swatches, Gradients, Patterns and Libraries | Partial | Adobe preset formats, grouping, search and full editors remain. |
| Plugins | Partial | Current hooks do not yet provide complete safe interactive ownership. |
| Properties | Partial | Inspector exists; tool-specific and Photopea parameter coverage remains. |
| Timeline | Partial | Frame/timeline system exists; keyframes, media and export fidelity remain. |
| Character and Paragraph | Partial | Controls exist inside text properties; shaping and standalone workflow parity remain. |
| Layer Comps | Missing | Descriptor preservation is not an editable panel. |
| Measurement Log / Notes | Missing | No persistent measurement or annotation panels. |

## Layer and document types

| Capability | Status | Principal remaining gap |
| --- | --- | --- |
| Raster and imported image layers | Partial | Tile-first runtime, high-depth editing, color-mode and large-document parity. |
| Groups | Validation needed | Complex isolation/pass-through/knockout/effect combinations need reference fixtures. |
| Text layers | Partial | Shaping, full typography, PSD compatibility and deterministic layout. |
| Shape layers | Partial | Complete live shapes, compound operations, strokes/fills and round-trip fidelity. |
| Adjustment layers | Partial | Parameter and renderer parity across 17 supported descriptors plus missing adjustment types. |
| Solid/gradient/pattern fill layers | Partial | Dedicated fill-layer semantics, transforms, presets and PSD compatibility. |
| Smart objects | Partial | Shared sources, nesting, replacement/relinking and complete filters. |
| Artboards | Partial | Creation/reorder UI, export behavior, backgrounds, nesting and PSD fidelity. |
| Raster masks | Partial | Linking, transform/apply commands, density/feather and high-depth behavior. |
| Vector masks | Partial | Full path editing, compound masks, linking, density/feather and round-trip fidelity. |
| Smart-filter masks | Partial | Complete per-filter/global mask semantics and blending options. |
| Channels | Partial | Spot/duotone/multichannel, calculations and color-managed output. |
| Paths | Partial | Complete creation/editing/clipboard/clipping-path behavior and compatibility. |
| Animation | Partial | Frame and timeline depth, timing, media and export reference tests. |
| Layer comps | Missing | Editable state model and panel. |
| Variables / datasets | Missing | Data-driven layer properties and local batch generation. |

## Adjustments and filters

The canonical assessment covers these 17 adjustment descriptors:

`Brightness/Contrast`, `Levels`, `Curves`, `Exposure`, `Vibrance`, `Hue/Saturation`, `Color Balance`, `Black & White`, `Photo Filter`, `Channel Mixer`, `Color Lookup`, `Invert`, `Posterize`, `Threshold`, `Gradient Map`, `Selective Color`, and `Camera Raw`.

Every adjustment remains **Partial** or **Validation needed** until its full parameter set, high-depth behavior, masking, smart-filter/destructive variants, presets and reference output are verified.

The current native filter graph contains `Gaussian Blur`, `Smart Sharpen`, `Add Noise`, `Wave`, `Emboss`, `Clouds`, and `Mosaic`. Family labels do not imply that Photopea's other blur, sharpen, noise, distort, stylize, render or pixelate filters exist.

## Formats

| Format family | Import | Export | Status / limitation |
| --- | --- | --- | --- |
| Studio project | Editable | Editable | Validation needed: migrations, corruption, streaming and recovery stress tests. |
| PSD / PSB | Layered, best in RGB 8-bit | Layered | Partial: real-world descriptor, color-mode, high-depth and round-trip corpus remains. |
| PNG / JPEG / WebP | Raster | Raster | Validation needed: metadata, ICC, orientation, large files and option parity. |
| AVIF | Raster | Raster | Partial: precision, metadata, alpha/color and encoder option parity. |
| GIF / APNG | Raster/animation paths | Animated from layers | Partial: timing, disposal, palette, transparency and frame metadata parity. |
| SVG | Editable supported vectors | Editable supported vectors | Partial: text, filters, symbols, masks, clipping and complex round-trip fidelity. |
| TIFF | Multipage raster | Layered multipage | Partial: compression, layers, color modes, metadata and high-depth fidelity. |
| OpenEXR / HDR | Tone-mapped preview with float source | No equivalent high-depth export | Partial: channel, metadata, color and end-to-end float workflow. |
| HEIF / HEIC | Raster | None | Partial: metadata, sequences, profiles and export. |
| ICO | Raster | None | Partial: multi-size/frame import and export. |
| PDF | Pages rasterized at 144 ppi | Raster image PDF | Partial: editable text/vector import and structured export are missing. |
| TIFF-based RAW | Embedded preview only | None | Missing full RAW development and demosaicing. |
| AI / EPS | None | None | Missing. |
| XCF / KRA | None | None | Missing. |
| Sketch / XD / Affinity / Clip Studio | None | None | Missing. |

## Presets and resources

| Resource | Studio coverage | Status | Principal remaining gap |
| --- | --- | --- | --- |
| Brushes | Local tips, Studio brushes, partial ABR | Partial | Broader ABR dynamics and reference strokes. |
| Tool presets | Local presets | Partial | Complete parameter capture, organization and external compatibility. |
| Swatches | Local color list | Partial | ACO/ASE import/export, groups and preset management. |
| Gradients | Local multi-stop gradients | Partial | Full editor, noise gradients and GRD import/export. |
| Patterns | Local procedural/bitmap patterns | Partial | PAT import/export, transforms, groups and preset management. |
| Shapes | Local Studio shape library | Partial | CSH import/export and broader live shapes. |
| Layer styles | Editable effects | Partial | Persistent style library and ASL import/export. |
| Actions | Local Studio actions | Partial | Complete recordability and ATN import/export. |
| Fonts | Persistent local browser fonts | Partial | Color fonts, shaping parity, organization and deterministic fallback. |
| Workspaces | Local saved layouts | Partial | Complete docking/focus/restoration parity. |

## Shortcuts and interaction conventions

Studio exposes editable bindings for file new/open/save, undo/redo, transform again, new/duplicate layer, actual pixels, zoom, and 29 tool targets. Tool-only bindings do not cover the whole command surface.

Remaining shortcut work includes:

- Every menu command and panel action needs a stable command identifier.
- Temporary Space/Command/Alt tool switching needs complete behavior.
- Unbound tools need Photopea-compatible defaults or intentional documented differences.
- Shortcut contexts, text-input suppression, conflicts, platform labels and reset behavior need browser interaction tests.
- Pointer modifiers, double-clicks, context menus, wheel gestures and tablet buttons need the same registry and fixtures as keyboard commands.

## Explicit exclusions

| Capability | Status | Reason |
| --- | --- | --- |
| Generative and neural editing | Excluded | Studio does not include AI features. |
| Photopea online storage and accounts | Excluded | Studio has no server or account system. |
| Advertising and premium account behavior | Excluded | Not part of image-editing parity. |
| Cloud collaboration | Excluded | Conflicts with the local-only product boundary. |
| Legacy Photoshop 3D / external model editing | Excluded | Outside the Photopea core 2D editing target. |

## Updating the matrix

1. Add or update the typed assessment when a tool, adjustment, filter, panel, or missing workflow changes.
2. Update the relevant table in this document for menu, layer, format, preset, shortcut, or workflow changes.
3. Add the evidence required by the roadmap definition of parity.
4. Change the status only after the evidence passes in CI.
5. Remove the corresponding task from `ROADMAP.md` only when no unfinished sub-capability remains.
