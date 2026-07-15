# Studio

Studio is a local-first image editor built as a pnpm/Turborepo monorepo. The editor runs entirely on the client and is shared between the web app and the Electron desktop shell.

## Workspace

```text
apps/
  web/          Landing page and Vite web application
  desktop/      Secure Electron wrapper
packages/
  editor/       Shared React editor and raster engine
```

The workspace currently uses React 19, Vite 8, Tailwind CSS 4, TypeScript 6, pnpm 11, Turborepo 2, and Electron 43.

## Development

Install dependencies and start the web app:

```sh
pnpm install
pnpm dev
```

- Landing page: <http://localhost:5173/>
- Image editor: <http://localhost:5173/app>

To launch the web app and Electron shell together:

```sh
pnpm dev:desktop
```

In this Nix-based workspace, where Node is not on the default `PATH`, the equivalent web command is:

```sh
nix shell nixpkgs#nodejs_latest -c npx pnpm@11.13.0 dev
```

## Quality checks

Turborepo runs checks across every workspace:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run all four with `pnpm check`.

## Architecture

`@studio/editor` owns the document model, raster engine, rendering, selection system, masks, project persistence, and editor interface. It exports a `StudioEditor` React component so web and desktop surfaces share the same implementation.

`@studio/web` owns navigation and presentation. `/` renders the product landing page and `/app` mounts the shared editor. The route also understands `#/app`, allowing the production Electron build to load the static Vite bundle over `file:`.

`@studio/desktop` is a minimal Electron host with context isolation, renderer sandboxing, and Node integration disabled. Packaging, signing, auto-update, and native file integrations will be added when desktop distribution begins.

All image decoding, editing, autosave, project serialization, and export remain client-side. No application backend is required.

## Current editor scope

- Transparent blank documents and mutable raster layers
- Brush, eraser, rectangle and ellipse selections
- Selection add, subtract, intersect, clear, and selection-aware pixel deletion
- Editable layer masks, clipping masks, blend modes, stack-based adjustment layers, and non-destructive per-layer filters
- Transform handles, rotation, multi-selection, alignment, visibility, locking, ordering, and recursively composited nested layer folders
- Folder drag-and-drop reparenting, inherited locks/visibility, pass-through blending, and hierarchy-aware duplication
- PNG, JPEG, WebP, and layered PSD opening with Photoshop stack order and folder hierarchy preservation
- PNG, JPEG, and WebP export
- Portable `.studio` projects and IndexedDB recovery
- Dirty-region raster undo/redo

PSD support currently follows `ag-psd`: RGB 8-bit PSD files are supported, while PSB, 16-bit, and several non-RGB colour modes are not.

## Commits

Use Conventional Commit messages, for example:

```text
feat(editor): add clipping masks
fix(web): preserve editor route on refresh
refactor: move shared rendering into the editor package
```
