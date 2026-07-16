# Studio parity roadmap

This is the working TODO for turning Studio into a serious local-first image editor. The order is intentional: later editing features depend on a stable document model, renderer, history system, and file round-tripping.

## Product boundaries

- Everything runs in the browser or the future Electron desktop shell.
- No server runtime, account system, cloud dependency, telemetry requirement, or AI features.
- Large local data belongs in IndexedDB / OPFS in browsers and the local filesystem in Electron.
- Expensive work can use Web Workers, OffscreenCanvas, WebAssembly, and WebGPU.
- All WebGPU code uses [TypeGPU](https://github.com/software-mansion/TypeGPU), with Canvas2D as a supported fallback.
- Browser and desktop share the document model, editor UI, renderer, codecs, and test fixtures.

## Already usable

- [x] Blank transparent document on launch and configurable new documents
- [x] PNG, JPEG, WebP, GIF, BMP, SVG, TIFF, PSD, and Studio project import
- [x] PNG, JPEG, and WebP image export plus Studio project save/load
- [x] Raster, image, text, shape, adjustment, and grouped layers
- [x] Layer ordering, clipping, opacity, visibility, locking, and common blend modes
- [x] Raster masks and non-destructive layer effects
- [x] Move, transform, crop, straighten, selection, paint, erase, fill, gradient, retouch, text, and shape tools
- [x] Pressure-sensitive brush dynamics and local custom brush tips
- [x] Locally loaded fonts
- [x] Canvas-edge rulers, guides, snapping, measurement, alignment, history, and keyboard shortcuts
- [x] Layer and folder drag-and-drop reordering with nested drop targets
- [x] Local recovery storage

## M0 — editor and rendering foundation

- [x] Version the Studio document schema and add explicit migrations
- [x] Separate serializable document data from runtime image/GPU resources
- [x] Replace full-document history snapshots with typed commands and transaction groups
- [x] Put composition rendering behind a backend interface
- [x] Keep a Canvas2D compatibility renderer
- [x] Add lazy TypeGPU capability detection and runtime lifecycle management
- [x] Implement the TypeGPU compositor with parity snapshots against Canvas2D
  - [x] Present native per-layer textures with every blend mode, raster masks, and clipping
  - [x] Apply brightness, contrast, saturation, and hue adjustment layers natively
  - [x] Composite isolated and nested group passes through TypeGPU with group opacity and blend modes
  - [x] Apply blur adjustment layers through a native TypeGPU sampling pass
  - [x] Apply brightness, contrast, saturation, hue, grayscale, sepia, and invert layer filters natively
  - [x] Apply layer-filter blur through separable native TypeGPU passes
  - [x] Apply color-overlay layer effects natively
  - [x] Add native drop-shadow and outer-glow effects
  - [x] Add GPU/Canvas pixel-parity snapshots
- [x] Move layer surfaces to a shared texture/resource registry
- [x] Add dirty rectangles, tile invalidation, mipmaps, and render caching
  - [x] Cache unchanged native background, image, raster, shape, clipping, and isolated-group passes
  - [x] Add dirty rectangles, tile invalidation, mipmaps, and tile-level cache eviction
- [x] Move rendering and heavy pixel operations to a Worker with OffscreenCanvas where supported
  - [x] Compose bitmap-safe documents in an OffscreenCanvas Worker with automatic main-thread fallback
  - [x] Downsample and reduce histogram pixels entirely in a Worker
  - [x] Keep text composition on the main thread until worker font resources can preserve exact typography
- [x] Add GPU device-loss recovery and automatic Canvas2D fallback
- [x] Add deterministic renderer fixtures for blend modes, masks, effects, and color transforms

## M1 — PSD fidelity and round-tripping

- [x] Build a corpus of legal PSD/PSB fixtures and visual golden tests
- [x] Preserve editable text layers, font metadata, and text bounds on import
  - [x] Preserve single-style horizontal text, font, color, alignment, tracking, rotation, and bounds
  - [x] Preserve mixed style runs, paragraph boxes, vertical text, warps, and missing-font metadata
- [x] Preserve vector shape layers and paths on import
  - [x] Import solid rectangles, rounded rectangles, ellipses, and basic strokes as editable shapes
  - [x] Preserve compound/custom paths, gradient and pattern fills, and complete stroke metadata
- [x] Preserve raster and vector masks, clipping groups, channels, and blend-if data
  - [x] Import PSD raster masks as editable Studio masks
  - [x] Consume basic shape vector masks as editable rectangle and ellipse geometry
  - [x] Preserve and render independent/compound vector masks, mask density/feather, and non-default blend-if data
  - [x] Decode editable 8-bit extra-channel pixels and rewrite locally changed channel planes
- [x] Preserve adjustment layers and layer styles as editable Studio properties
  - [x] Import drop shadows, outer glows, and color overlays as editable Studio effects
  - [x] Import brightness/contrast and global hue/saturation adjustment layers as editable adjustments
  - [x] Preserve and render primary inner shadow/glow, bevel, satin, gradient/pattern overlay, and stroke styles
  - [x] Preserve every PSD adjustment descriptor as typed Studio data and render supported adjustments locally
  - [x] Evaluate embedded `.cube` Color Lookup LUT previews entirely on-device
  - [x] Preserve and render deterministic seeded noise-gradient layer styles
  - [x] Preserve and render multiple style instances while retaining custom contour descriptors
  - [x] Preview embedded `.3dl` Color Lookup LUTs, including input shaper tables
  - [x] Preview embedded Iridas `.look` Color Lookup LUTs
  - [x] Bake abstract and device-link ICC-profile Color Lookup previews through lazy client-side LittleCMS WASM
  - [x] Preview and round-trip gradient and pattern layer-effect strokes
- [x] Preserve smart objects, linked assets, layer comps, guides, slices, and metadata
- [x] Support 8-bit, 16-bit, and 32-bit PSD/PSB documents
  - [x] Preserve exact unedited high-depth raster and alpha samples with deterministic 8-bit canvas previews
  - [x] Write layered 16/32-bit PSD/PSB files with promoted edited pixels, masks, and composite channels
- [x] Write layered PSD files from Studio documents
- [x] Add import → export → import structural and pixel-diff tests
- [x] Warn precisely when an unsupported PSD feature must be flattened

## M2 — smart objects and non-destructive filters

- [x] Add embedded and linked smart-object layer types
- [x] Open smart-object contents as nested documents and propagate saved edits
- [x] Add replace/relink/export-contents actions
- [x] Add non-destructive affine transform matrices independent of source pixels
- [x] Add ordered smart-filter stacks with visibility, masks, opacity, and blend modes
- [x] Cache smart-object and smart-filter results by content hash

## M3 — selections, masks, and channels

- [x] Make selections sparse tile-based pixel masks rather than rectangle-only state
- [x] Add elliptical marquee, single-row/column marquee, polygonal lasso, magnetic lasso, and object/contiguous selection tools
- [x] Add add/subtract/intersect selection modes to every selection tool
- [x] Add color range, luminosity range, subject-free edge selection, grow, and similar
- [x] Add a Select and Mask workspace with radius, feather, contrast, shift edge, and decontamination
- [x] Add quick mask mode
- [x] Add vector masks and editable raster/vector mask density, feather, and linking
- [x] Add a Channels panel with RGB/CMYK/alpha channels and channel operations
- [x] Save, load, combine, and transform alpha-channel selections

## M4 — paths, vectors, and shapes

- [x] Add a Pen tool with Bézier handles, path continuation, and point conversion
- [x] Add direct/path selection tools and keyboard editing
- [x] Add a Paths panel with work paths, saved paths, clipping paths, and fill/stroke actions
- [x] Support compound paths and boolean shape operations
- [x] Add editable stroke alignment, caps, joins, dashes, gradients, and pattern fills
- [x] Add custom shape import/export and a reusable local shape library
- [x] Preserve vector data through SVG and PSD round-trips

## M5 — transforms, layout, and documents

- [x] Add skew, perspective, distort, and multi-point warp transforms
- [x] Add perspective crop and perspective warp
- [x] Add puppet warp with editable mesh pins
- [x] Add content-aware scale without server or AI dependencies
- [x] Add transform-again, numeric reference points, and precise interpolation controls
- [x] Add artboards, artboard export, and per-artboard backgrounds
- [x] Add multiple open documents, tabs, duplicate document, and move/copy layers between documents
- [x] Add linked views, split views, navigator, rotate view, and scrubby zoom
- [x] Add configurable grids, guide layouts, smart guides, and reusable workspace layouts

## M6 — adjustments, filters, and color

- [x] Add Curves with per-channel points, eyedroppers, histogram, and presets
- [x] Add Levels, Exposure, Vibrance, Selective Color, Channel Mixer, Color Lookup, Gradient Map, and Black & White
- [x] Add Camera Raw-style local controls implemented entirely on-device
- [x] Build a TypeGPU filter graph for blur, sharpen, noise, distort, stylize, render, and pixelate families
- [x] Add filter masks, live previews, cancelable jobs, and reusable presets
- [ ] Add editable 8/16/32-bit document precision
- [ ] Add ICC profile parsing, conversion, assign/convert profile, proof colors, and gamut warnings
- [ ] Add RGB, grayscale, indexed, and CMYK document modes where browser color APIs permit accurate output
- [ ] Add histogram, info, and scopes panels backed by worker/GPU reductions
  - [x] Add a sampled RGB/luminance histogram with local Worker reduction and live statistics
  - [ ] Add exact tiled/high-precision histograms, point sampling, and waveform/vectorscope GPU reductions

## M7 — typography

- [ ] Add point text and paragraph text boxes with resize/reflow behavior
- [ ] Add full character and paragraph panels
- [ ] Add kerning, tracking, leading, baseline shift, horizontal/vertical scale, faux styles, underline, and strikethrough
- [ ] Add OpenType feature controls, variable-font axes, and font fallback runs
- [ ] Add text-on-path, vertical text, warp text, and editable text transforms
- [ ] Preserve advanced text metadata through Studio and PSD documents
- [ ] Add a persistent local font library with missing-font substitution controls
  - [x] Persist imported web fonts locally and expose them through the Libraries panel and text controls
  - [ ] Add missing-font detection, substitution mapping, and font-library removal controls

## M8 — painting and retouching

- [ ] Add a high-performance tiled brush engine with spacing, scatter, count, texture, dual brush, color dynamics, smoothing, and build-up
- [ ] Support ABR brush import and preserve compatible dynamics
- [ ] Add pencil, color replacement, mixer brush, and history brush tools
- [ ] Add clone source sampling, aligned/current-and-below modes, rotation, and scale
- [ ] Add pattern stamp, dodge, burn, sponge, blur, sharpen, and smudge parity
- [ ] Add non-AI healing and content-aware fill using local patch-match/image-processing algorithms
- [ ] Add local pattern, gradient, swatch, tool preset, and brush preset libraries
  - [x] Add persistent local custom-swatch, two-colour gradient, and procedural-pattern libraries connected to live editor state
  - [x] Expose browser-persisted custom brush tips and fonts through the Libraries panel
  - [ ] Add tool-preset and expanded brush-preset libraries plus multi-stop gradients and bitmap pattern import/export
- [ ] Add tablet tilt, twist, barrel button, and per-device pressure calibration

## M9 — workflow and extensibility

- [ ] Add editable keyboard shortcuts and menus
- [ ] Add dockable/resizable panels and saved workspaces
  - [x] Swap the Properties and Layers docks, resize both side panels, and persist the layout and widths locally
  - [x] Add collapsible docks and built-in or user-named workspace presets
  - [x] Add a persisted tabbed utility-panel stack
  - [x] Add persisted tab reordering and a draggable, resizable, detachable utility-panel stack
  - [ ] Add multiple simultaneous stacks, independent floating panels, and vertical resizing
- [ ] Add History, Actions, Properties, Navigator, Histogram, Info, Channels, Paths, Swatches, Gradients, Patterns, and Libraries panels
  - [x] Add functional Properties, Layers, History, Navigator, Histogram, Info, Swatches, Gradients, Patterns, and Libraries panels
  - [ ] Add Actions panel
  - [x] Add Channels panel
  - [x] Add Paths panel
- [ ] Add actions recording, playback, conditional steps, and batch processing in a Worker
- [ ] Add a sandboxed local scripting API with explicit filesystem permissions
- [ ] Add plugin hooks for importers, exporters, filters, panels, and tools without requiring a server
- [ ] Add searchable commands, contextual help, crash recovery, and diagnostic export

## M10 — formats and output

- [ ] Add robust TIFF, OpenEXR, HDR, HEIF/AVIF, ICO, PDF, and RAW import where client-side codecs exist
- [ ] Add layered TIFF, PDF, SVG, GIF/APNG, AVIF, and PSD/PSB export
- [ ] Add frame animation and timeline animation with onion skinning
- [ ] Add slices, asset generation, export presets, metadata controls, and batch export
- [ ] Add print sizing, bleed, crop marks, and local print/PDF workflows
- [ ] Preserve resolution, EXIF, XMP, ICC, and orientation metadata intentionally

## M11 — Electron desktop shell

- [ ] Keep Electron a thin shell around the shared web editor
- [ ] Add native open/save dialogs, recent files, drag/drop, and OS file associations
- [ ] Add safe atomic filesystem writes and external-change detection
- [ ] Add native menus, shortcuts, clipboard integration, and color picker
- [ ] Add optional local scratch-disk/cache management for documents larger than memory
- [ ] Package signed macOS, Windows, and Linux builds with automatic updates

## Long-tail parity

- [ ] Layer comps and states
- [ ] Notes and annotations
- [ ] Count, sampler, and advanced measurement records
- [ ] Variables and data-driven graphics
- [ ] Vanishing Point and advanced lens correction
- [ ] 3D/imported model features only if they still serve the product direction

## Definition of parity

A feature is not complete merely because a control exists. It needs undo/redo, save/load fidelity, keyboard access, useful error handling, acceptable large-document performance, browser and Electron behavior, and automated tests. PSD-related work also needs a documented round-trip result or a clear flattening warning.
