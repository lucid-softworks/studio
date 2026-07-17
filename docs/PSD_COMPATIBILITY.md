# PSD and PSB compatibility

Last audited: 2026-07-17

This table replaces a single broad “PSD supported” claim with fixture-backed behavior. `Editable` means Studio exposes a local editable representation. `Preserved` means data is retained for export but has no complete editing surface. `Partial` means only the documented subset is editable. `Converted` and `Rasterized` are destructive compatibility paths. `Unsupported` data is not emitted.

The typed source is [`psd-compatibility.ts`](../packages/editor/src/editor/psd-compatibility.ts). Tests require every row to have existing automated evidence and require every typed claim to appear below.

| ID | Capability | Import | Export | Current behavior |
| --- | --- | --- | --- | --- |
| `container-psd` | PSD container | Editable | Editable | Layered PSD files use local worker-backed reading and segmented writing. |
| `container-psb` | PSB large-document container | Editable | Editable | Version-two headers, long section lengths, layers, and high-depth composite replacement are covered. |
| `rgb-8` | RGB, 8 bits per channel | Editable | Editable | Primary editable path with layered and composite pixel checks. |
| `rgb-high-depth` | RGB, 16 or 32 bits per channel | Partial | Partial | Exact samples survive unchanged raster layers; display and many edits still pass through an 8-bit canvas. |
| `non-rgb-modes` | CMYK, Lab, grayscale, indexed, duotone, multichannel | Converted | Unsupported | Converted to RGB for editing; original channel semantics are not emitted. |
| `raster-layers` | Raster layers and core properties | Editable | Editable | Pixels, opacity, visibility, locking, clipping, and supported blend modes remain editable. |
| `groups` | Nested groups and pass-through folders | Partial | Partial | Nesting, order, and core properties remain editable; IDs, effects, and Blend If metadata round-trip without a complete group-effects editing surface. |
| `text` | Text layers | Partial | Partial | Supported text, style runs, paragraph boxes, vertical orientation, warps, and missing fonts remain editable. |
| `shapes` | Shapes, fills, strokes, and compound paths | Partial | Partial | Supported vector data remains editable; complex descriptors fall back to raster previews. |
| `adjustments` | Adjustment layers | Partial | Partial | Supported typed descriptors remain editable; unsupported families are reported. |
| `effects` | Layer effects and multiple instances | Partial | Partial | Primary families, repeated instances, contours, gradient strokes, and pattern strokes round-trip. |
| `masks` | Raster and vector masks | Partial | Partial | Supported pixels, paths, density, feather, linking, and inversion round-trip. |
| `advanced-blending` | Blend If, fill opacity, knockout, channel restrictions | Partial | Partial | Blend If and all modeled Photoshop advanced-blending fields round-trip; settings without compositor support are reported as preserved but not previewed. |
| `smart-objects` | Embedded and linked smart objects | Partial | Partial | Transforms, descriptors, embedded PSB documents, and relinking metadata are retained. |
| `smart-filters` | Smart filters | Partial | Partial | Supported settings and original descriptors are retained; masks and full dialog behavior remain incomplete. |
| `channels` | Alpha channels | Editable | Editable | Named channel metadata and pixels can be imported, edited, and exported. |
| `document-metadata` | Guides, resolution, XMP, linked files, Layer Comps | Preserved | Preserved | Known resources round-trip; preserved Layer Comps have no editing panel yet. |
| `animation` | Frame and timeline metadata | Rasterized | Unsupported | Layer pixels remain, but Photoshop animation descriptors do not enter Studio’s timeline. |
| `unknown-descriptors` | Unknown Photoshop descriptors | Partial | Partial | Selected descriptor families are retained; arbitrary unknown blocks are not yet lossless. |

## Evidence scope

- Generated PSD and PSB documents are checked for headers, layer structure, masks, effects, and pixel differences in [`psd-fixtures.test.ts`](../packages/editor/src/editor/psd-fixtures.test.ts).
- Descriptor-level and Studio import/export round trips are covered in [`psd.test.ts`](../packages/editor/src/editor/psd.test.ts).
- Segmented output and large section handling are covered in [`psd-writer.test.ts`](../packages/editor/src/editor/psd-writer.test.ts).
- Browser workers, downloads, cancellation, and reopening are covered in [`psd-workers.spec.ts`](../apps/web/e2e/psd-workers.spec.ts).

The committed corpus is still primarily generated. A broader set of licensed files produced by Photoshop and Photopea remains required before claiming general real-world round-trip parity.
