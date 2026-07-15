# Studio

A structured, client-side composition editor for turning screenshots, text, images, and shapes into presentation-ready visual assets.

## Stack

- React 19
- Vite 8
- Tailwind CSS 4 via `@tailwindcss/vite`
- TypeScript 6
- Vitest

## Development

```sh
npm install
npm run dev
```

In this Nix-based workspace, where Node is not on the default `PATH`, use:

```sh
nix shell nixpkgs#nodejs_latest -c npm run dev -- --host 0.0.0.0
```

The editor requires no backend. Uploaded images remain in the browser, autosave uses IndexedDB, and portable `.studio` project files are assembled and downloaded locally.

## Quality checks

```sh
npm run lint
npm run test
npm run typecheck
npm run build
```

## Current scope

- Transparent checkerboard document on first launch, with one-click empty raster layers
- Typed image, text, rectangle, and ellipse layers
- Single and multi-layer selection, visibility, locking, ordering, naming, duplication, deletion, and alignment
- Dedicated SVG transform overlay with eight resize handles, rotation, Shift aspect locking, and Alt/Option centre resizing
- Undo/redo with grouped drag and slider history
- PNG, JPEG, and WebP upload, drop, paste, and native-size document opening
- Layered PSD import in the browser through `ag-psd`
- Gradient, solid, and uploaded-image backgrounds
- Grid, dot, and wave patterns
- Per-layer positioning, opacity, rotation, image flip, scale, corners, and shadows
- Text content, sizing, weight, colour, alignment, and tracking
- Shape sizing, fill, stroke, and corners
- Canvas zoom and keyboard nudging
- Full-resolution PNG, JPEG, and WebP export
- Client-side `.studio` project save/open and automatic local recovery
- Mutable raster layers with Brush and Eraser tools
- Dirty-region pixel undo/redo and transparent canvas support

The next raster milestones are brush hardness/flow presets, marquee and lasso selections, layer masks, and adjustment layers. Server-side processing is intentionally outside the product architecture.

PSD import currently follows `ag-psd` support: RGB 8-bit PSD files are supported, while PSB, 16-bit, and several non-RGB colour modes are not yet available through the decoder.
