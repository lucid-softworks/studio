# Studio → Photopea parity roadmap

This roadmap contains only unfinished work required to match Photopea's core offline image-editing workflows. Completed implementation history belongs in Git, not in this file.

## Product boundaries

- Studio remains fully client-side and local-first.
- No server runtime, accounts, cloud dependency, telemetry requirement, or AI features.
- Browser storage uses IndexedDB and OPFS; a future Electron shell may use the local filesystem.
- Expensive work may use Web Workers, OffscreenCanvas, WebAssembly, and WebGPU.
- All WebGPU work uses [TypeGPU](https://github.com/software-mansion/TypeGPU), with a supported Canvas2D fallback.
- Photopea parity means its core local editing behavior and file compatibility, excluding its online storage, account, advertising, and AI-assisted features.

## Definition of parity

A feature is complete only when it has:

- Equivalent editing behavior and useful parameter depth.
- Correct undo/redo and transaction grouping.
- Reliable Studio project save/load behavior.
- Documented import/export behavior for applicable external formats.
- Keyboard access, modifier keys, contextual controls, and useful errors.
- Acceptable performance on large documents.
- Automated unit, interaction, and visual-regression coverage.
- Matching behavior in TypeGPU and Canvas2D, where both renderers support it.

## P2 — PSD/PSB fidelity and round-trip confidence

- [ ] Build a broad legal corpus of real Photoshop and Photopea documents rather than relying mainly on generated fixtures.
- [ ] Validate Photoshop/Photopea → Studio → Photoshop/Photopea round-trips structurally and visually.
- [ ] Cover RGB, CMYK, Lab, grayscale, indexed, duotone, multichannel, 8-bit, 16-bit, and 32-bit PSD/PSB variants.
- [ ] Validate nested groups, clipping stacks, blend-if, knockout, fill opacity, artboards, channels, guides, slices, and metadata in combination.
- [ ] Validate mixed-style text, complex scripts, vertical text, text-on-path, text warp, paragraph layout, and missing-font substitution.
- [ ] Validate compound shapes, custom paths, vector masks, raster masks, mask linking, density, and feathering.
- [ ] Validate every supported adjustment, layer effect, multiple effect instance, contour, gradient, pattern, and smart filter.
- [ ] Validate embedded and linked smart objects, shared sources, nested documents, transforms, replacement, and relinking.
- [ ] Preserve unsupported descriptors losslessly when possible and warn precisely before any destructive edit or export.
- [ ] Add differential fuzzing for PSD/PSB parsing and writing with deterministic crash fixtures.

## P3 — precision, color, and typography

- [ ] Make 16-bit and 32-bit raster editing end-to-end rather than preserving high-depth source samples behind an 8-bit editing surface.
- [ ] Use float or high-precision TypeGPU textures and filter passes without silent 8-bit quantization.
- [ ] Preserve precision through masks, selections, compositing, adjustments, smart filters, history, and export.
- [ ] Complete color-managed display and conversion for RGB, CMYK, Lab, grayscale, indexed, duotone, and spot-channel workflows.
- [ ] Verify ICC assign/convert, proof colors, rendering intents, black-point compensation, and gamut warnings against reference outputs.
- [ ] Add accurate high-depth histograms, scopes, samplers, and numeric readouts.
- [ ] Integrate a browser-safe shaping engine for complex scripts, bidirectional text, CJK layout, ligatures, and font fallback.
- [ ] Support color fonts and verify OpenType features and variable axes against reference shaping.
- [ ] Make text layout deterministic across browser and desktop environments.

## P4 — missing Photopea workflows

### Layer comps and data-driven documents

- [ ] Add a Layer Comps panel with create, apply, update, rename, delete, and last-document-state behavior.
- [ ] Capture visibility, position, appearance, and smart-object comp selection with per-comp flags.
- [ ] Preserve and edit layer comps through PSD/PSB and Studio project round-trips.
- [ ] Add layer variables for visibility, text replacement, and pixel replacement.
- [ ] Import CSV datasets, map local source images, preview records, and batch-export datasets locally.
- [ ] Preserve compatible variable and dataset metadata through PSD documents.

### Perspective and distortion workspaces

- [ ] Add a Vanishing Point workspace with editable perspective planes and connected planes.
- [ ] Add perspective-aware brush, clone, marquee, paste, move, and transform behavior.
- [ ] Preserve Vanishing Point plane data and support local measurement records where formats allow it.
- [ ] Add a Liquify workspace with push, reconstruct, smooth, twirl, pucker, bloat, freeze, and thaw tools.
- [ ] Add advanced lens correction and adaptive wide-angle controls with editable correction guides.

### Blur and photographic workflows

- [ ] Add Blur Gallery field, iris, tilt-shift, path, and spin blur with multiple editable controls.
- [ ] Add editable bokeh, motion, noise, mask, and smart-filter behavior for Blur Gallery effects.
- [ ] Add local panorama stitching with alignment, seam blending, and projection controls.
- [ ] Add exposure fusion and HDR merge without AI or network services.
- [ ] Add local focus stacking and automatic layer alignment/blending.
- [ ] Add a real RAW development pipeline with sensor demosaicing, camera white balance, lens metadata, and non-destructive settings.

### Measurement and annotation


### Vectorization

- [ ] Add local bitmap vectorization with color, monochrome, threshold, smoothing, corner, and noise controls.
- [ ] Produce editable compound paths and shape layers from vectorization results.

## P5 — depth of existing editing systems

### Painting and retouching

- [ ] Expand ABR compatibility across computed brushes, sampled brushes, textures, dual brushes, transfer, pose, and color dynamics.
- [ ] Match Photopea brush spacing, smoothing, build-up, scatter, pressure, tilt, and stamp interpolation on reference strokes.
- [ ] Improve mixer-brush wetness, load, mix, flow, canvas sampling, and clean/load behavior.
- [ ] Improve healing and patch matching across texture, luminosity, edges, transformed layers, and current-and-below sampling.
- [ ] Add complete dodge/burn range controls and sponge saturate/desaturate behavior.
- [ ] Add clone-source overlays, multiple sources, flip, offset, rotation, scale, and source presets.
- [ ] Add Adobe-compatible PAT import/export and verify bitmap pattern transforms.

### Selections and masks

- [ ] Improve magnetic-lasso edge following, anchor editing, frequency, contrast, and width controls.
- [ ] Improve object selection and non-AI foreground extraction for difficult edges, holes, transparency, hair, and repeated colors.
- [ ] Complete Select and Mask brush, edge refinement, view modes, output modes, and decontamination behavior.
- [ ] Add channel-based calculations and Apply Image-style selection/mask workflows.
- [ ] Verify selection operations on transformed, high-depth, CMYK, Lab, and artboard documents.

### Layers, effects, and smart objects

- [ ] Complete advanced blending options including channel-specific blending, knockout, transparency-shapes-layer, and interior-effect grouping.
- [ ] Match layer-effect contours, noise, jitter, source, technique, range, choke, spread, and scale behavior.
- [ ] Add ASL style import/export and a persistent style preset library.
- [ ] Complete smart-filter reorder, per-filter masks, blending options, editable dialogs, and shared smart-object source behavior.
- [ ] Verify linked smart objects with browser file handles and desktop filesystem changes.
- [ ] Add complete fill-layer behavior for solid color, gradient, and pattern layers.

### Paths, vectors, and shapes

- [ ] Match Pen, Free Pen, Curvature Pen, Add/Delete Anchor, Convert Point, and modifier-key behavior.
- [ ] Complete live-shape properties for rectangles, ellipses, polygons, lines, stars, and custom shapes.
- [ ] Add Adobe-compatible CSH custom-shape import/export.
- [ ] Verify compound operations, fill rules, stroke alignment, gradients, patterns, transforms, and PSD/SVG round-trips.

### Adjustments and filters

- [ ] Audit every Photopea adjustment and filter parameter against Studio rather than treating filter-family coverage as parity.
- [ ] Add missing destructive and smart-filter variants, selection/mask behavior, previews, presets, and blending options.
- [ ] Match Camera Raw-style local controls without depending on Adobe services or AI masks.
- [ ] Add reusable filter and adjustment preset formats where Photopea supports them.

### Animation

- [ ] Match frame creation, duplication, disposal, delays, tweening, onion skinning, playback, and export behavior.
- [ ] Complete timeline keyframes for position, opacity, transforms, styles, masks, and smart objects.
- [ ] Add video-layer and local media timeline support only where browser codecs provide deterministic behavior.
- [ ] Validate GIF, APNG, WebP, and supported video exports against timing and color reference fixtures.

## P6 — formats and presets

- [ ] Match Photopea's practical import coverage for AI/EPS, XCF, KRA, Sketch, XD, Affinity, Clip Studio, and other documented local formats.
- [ ] Preserve editable PDF text and vectors when the source data permits it instead of always rasterizing pages.
- [ ] Improve SVG import/export for filters, masks, clipping, text, gradients, patterns, symbols, and compound paths.
- [ ] Add multi-page and layered TIFF interoperability tests across compression and color modes.
- [ ] Complete RAW-family detection and decoding beyond embedded preview extraction.
- [ ] Add Adobe-compatible ACO/ASE swatches, GRD gradients, PAT patterns, CSH shapes, ASL styles, and ATN actions.
- [ ] Verify metadata preservation and intentional stripping for every supported input/output format.

## P7 — automation and extensibility

- [ ] Expand action recording so every user-visible command has stable, serializable parameters.
- [ ] Add ATN import/export for compatible action steps and precise warnings for unsupported commands.
- [ ] Add a Photopea/Photoshop-like document scripting compatibility layer over the sandboxed local API.
- [ ] Provide deterministic script permissions, timeouts, cancellation, undo grouping, and diagnostics.
- [ ] Expand plugin hooks beyond command mapping so tools and filters can own interactive state, previews, properties, and serialization safely.
- [ ] Add conformance fixtures for actions, scripts, batch processing, and plugins.

## P8 — workflow and interface parity

- [ ] Audit every Photopea shortcut, temporary tool switch, modifier key, context menu, and double-click action.
- [ ] Complete tool-specific option bars so all important parameters are available without opening unrelated panels.
- [ ] Match layer-panel affordances for effects, masks, clipping, smart filters, smart objects, comps, channels, and animation state.
- [ ] Complete panel docking, grouping, floating, resizing, keyboard focus, and workspace restoration edge cases.
- [ ] Add robust clipboard transfer for pixels, vectors, text, masks, paths, and layers between Studio and external applications.
- [ ] Add multi-document drag/copy workflows with predictable smart-object and linked-resource behavior.
- [ ] Improve touch, stylus, high-DPI, zoomed-page, and reduced-motion behavior.
- [ ] Complete screen-reader names, focus order, keyboard-only operation, contrast, and error announcement.
- [ ] Add localization infrastructure before interface strings become harder to extract safely.

## P9 — release confidence

- [ ] Run the complete parity matrix in Chromium, Firefox, and Safari with documented capability fallbacks.
- [ ] Add crash and recovery tests for tab termination, GPU loss, worker failure, quota exhaustion, and interrupted saves.
- [ ] Add fuzz and malformed-file tests for every parser and project migration.
- [ ] Add deterministic memory-leak tests for repeated open/close, undo/redo, smart-object editing, and animation playback.
- [ ] Add visual and structural round-trip reports to CI artifacts.
- [ ] Publish supported-browser, format, color, precision, and maximum-tested-document guidance.
- [ ] Require every parity claim to link to a fixture, benchmark, or compatibility test.

## Explicitly out of scope

- Generative Fill, Generative Expand, neural filters, and other AI-dependent features.
- Accounts, advertising, cloud documents, shared libraries, and online collaboration.
- Server-side conversion, rendering, storage, or batch processing.
- Legacy Photoshop 3D and external model-editing workflows.
- Exact compatibility with proprietary Photoshop plugins that cannot run safely in a browser.
