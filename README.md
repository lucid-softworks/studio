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

Oxlint provides the repository-wide Oxc lint gate, including React hooks, unused suppression checks, and type-aware unhandled-promise detection. Turborepo coordinates the remaining workspace checks:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run `pnpm lint:fix` to apply safe Oxc fixes. Run all four checks with `pnpm check`.
`pnpm lint` also runs React Doctor in full-repository mode and fails on warnings or errors. Run `pnpm doctor` to execute that blocking scan directly.

## Cloudflare deployment

The web app deploys as client-only Cloudflare Workers Static Assets. There is no Worker script, API, server-side rendering, account system, or server-side document processing. Wrangler serves the Vite output directly and falls back to `index.html` for `/app` and other client routes.

Authenticate once, preview the production build locally, and deploy:

```sh
pnpm --filter @studio/web exec wrangler login
pnpm preview:cloudflare
pnpm deploy:cloudflare
```

The checked-in configuration lives at `wrangler.jsonc` in the repository root and publishes `apps/web/dist`. The first deployment creates the `studio` Worker project; subsequent deployments update it. A custom domain can be attached from the Cloudflare dashboard without changing the application build.

For Cloudflare Git builds, use the repository root with:

```text
Build command: pnpm build
Deploy command: pnpm exec wrangler deploy
```

The generated asset directory is `apps/web/dist`. The root-level Wrangler configuration also lets Cloudflare's default `npx wrangler deploy` command deploy the monorepo without workspace auto-detection.

## Architecture

`@studio/editor` owns the document model, raster engine, rendering, selection system, masks, project persistence, and editor interface. It exports a `StudioEditor` React component so web and desktop surfaces share the same implementation.

`@studio/web` owns navigation and presentation. `/` renders the product landing page and `/app` mounts the shared editor. The route also understands `#/app`, allowing the production Electron build to load the static Vite bundle over `file:`.

`@studio/desktop` is a thin Electron host with context isolation, renderer sandboxing, and Node integration disabled. It includes native open/save dialogs, recent files, atomic writes, file associations, external-change notifications, clipboard image writes, a screen colour picker, scratch storage, update checks, and electron-builder targets. Producing signed distributable builds still requires the platform signing credentials used by the release environment.

All image decoding, editing, autosave, project serialization, and export remain client-side. No application backend is required.

## Current support

Studio has broad editor coverage, but feature presence is not a claim of Photopea-level fidelity. The pending-only [parity roadmap](docs/ROADMAP.md) records the compatibility, depth, performance, and validation work that remains.

The editor currently provides raster, image, text, shape, adjustment, smart-object, animation, and grouped layers; masks, clipping, blend modes, layer effects, filters, paths, channels, selections, transforms, painting and retouching tools; local fonts, brushes, patterns, gradients, swatches, actions, scripts, plugins, recovery, and multi-document workspaces.

### File support

- Studio projects: editable `.studio` save/load with IndexedDB recovery.
- Photoshop: layered PSD and PSB import/export, including preserved high-depth sample data, editable supported structures, and compatibility warnings.
- Browser images: PNG, JPEG, WebP, GIF, BMP, AVIF, SVG, and ICO import where the browser or bundled codec supports the file.
- Advanced raster input: TIFF, OpenEXR, HDR, HEIF/HEIC, PDF, and embedded previews from supported TIFF-based RAW containers.
- Additional output: AVIF, layered TIFF, PDF/print PDF, SVG, GIF, and APNG workflows.

PSD/PSB support uses `ag-psd` plus Studio's local high-depth and metadata handling. RGB 8-bit documents have the broadest editable path. Studio can preserve and rewrite supported 16-bit and 32-bit PSD/PSB samples, but their interactive canvas preview and several editing paths are still 8-bit. Non-RGB Photoshop documents are currently converted to RGB for editing with a compatibility warning. See the parity roadmap instead of assuming every Photoshop descriptor or colour mode round-trips perfectly.

PDF pages are currently rasterized on import, and RAW containers use a locally decoded embedded preview rather than full sensor demosaicing. Electron packaging targets are configured for macOS, Windows, and Linux, while signing and publishing depend on release credentials.

## Commits

Use Conventional Commit messages, for example:

```text
feat(editor): add clipping masks
fix(web): preserve editor route on refresh
refactor: move shared rendering into the editor package
```
