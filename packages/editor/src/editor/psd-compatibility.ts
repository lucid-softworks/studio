export type PsdCompatibilityStatus = 'editable' | 'partial' | 'preserved' | 'converted' | 'rasterized' | 'unsupported'

export type PsdCompatibilityEntry = {
  id: string
  capability: string
  import: PsdCompatibilityStatus
  export: PsdCompatibilityStatus
  detail: string
  evidence: readonly string[]
}

const entry = (id: string, capability: string, importStatus: PsdCompatibilityStatus, exportStatus: PsdCompatibilityStatus, detail: string, ...evidence: string[]): PsdCompatibilityEntry => ({
  id,
  capability,
  import: importStatus,
  export: exportStatus,
  detail,
  evidence,
})

export const psdCompatibility: readonly PsdCompatibilityEntry[] = [
  entry('container-psd', 'PSD container', 'editable', 'editable', 'Layered PSD files open and export locally through worker-backed readers and segmented writers.', 'packages/editor/src/editor/psd-fixtures.test.ts', 'apps/web/e2e/psd-workers.spec.ts'),
  entry('container-psb', 'PSB large-document container', 'editable', 'editable', 'Version-two PSB headers, long section lengths, layered content, and high-depth composite replacement are supported.', 'packages/editor/src/editor/psd-fixtures.test.ts', 'packages/editor/src/editor/psd-writer.test.ts'),
  entry('rgb-8', 'RGB, 8 bits per channel', 'editable', 'editable', 'This is the primary fully editable PSD path and retains layered pixels and composite output.', 'packages/editor/src/editor/psd-fixtures.test.ts'),
  entry('rgb-high-depth', 'RGB, 16 or 32 bits per channel', 'partial', 'partial', 'Exact source samples survive unchanged raster layers, but display and many edits still use an 8-bit canvas representation.', 'packages/editor/src/editor/psd.test.ts'),
  entry('non-rgb-modes', 'CMYK, Lab, grayscale, indexed, duotone, and multichannel', 'converted', 'unsupported', 'The source is converted to RGB for editing; original non-RGB channel semantics are not emitted on export.', 'packages/editor/src/editor/psd.test.ts'),
  entry('raster-layers', 'Raster layers, opacity, visibility, locking, clipping, and blend modes', 'editable', 'editable', 'Supported blend modes and core layer properties remain editable; unsupported blend modes are reported precisely.', 'packages/editor/src/editor/psd.test.ts', 'packages/editor/src/editor/psd-fixtures.test.ts'),
  entry('groups', 'Nested groups and pass-through folders', 'partial', 'partial', 'Folder order, nesting, and core properties remain editable; Photoshop IDs, effects, and Blend If metadata round-trip without a complete group-effects editing surface.', 'packages/editor/src/editor/psd.test.ts', 'packages/editor/src/editor/psd-fixtures.test.ts'),
  entry('text', 'Text layers', 'partial', 'partial', 'Supported point and paragraph text, style runs, vertical orientation, warps, and missing-font metadata remain editable; unsupported engine data is rasterized with a warning.', 'packages/editor/src/editor/psd.test.ts'),
  entry('shapes', 'Shape layers, vector fills, strokes, and compound paths', 'partial', 'partial', 'Supported vector shapes remain editable; complex unsupported vector descriptors use their raster preview.', 'packages/editor/src/editor/psd.test.ts'),
  entry('adjustments', 'Adjustment layers', 'partial', 'partial', 'Supported typed Photoshop adjustment descriptors remain editable; unsupported adjustment families are reported.', 'packages/editor/src/editor/psd.test.ts'),
  entry('effects', 'Layer effects and multiple effect instances', 'partial', 'partial', 'Primary effect families, repeated instances, custom contours, gradient strokes, and pattern strokes round-trip; the complete Photoshop parameter surface is not implemented.', 'packages/editor/src/editor/psd.test.ts'),
  entry('masks', 'Raster masks and vector masks', 'partial', 'partial', 'Editable masks, density, feather, linking, inversion, and compound vector paths round-trip for supported mask forms.', 'packages/editor/src/editor/psd.test.ts', 'packages/editor/src/editor/psd-fixtures.test.ts'),
  entry('advanced-blending', 'Blend If, fill opacity, and knockout', 'partial', 'partial', 'Blend If ranges round-trip on layers and groups; knockout remains unsupported and is reported.', 'packages/editor/src/editor/psd.test.ts'),
  entry('smart-objects', 'Embedded and linked smart objects', 'partial', 'partial', 'Placed transforms, linked-file descriptors, embedded PSB documents, and relinking metadata are retained; shared-source and filesystem refresh behavior remains incomplete.', 'packages/editor/src/editor/psd.test.ts'),
  entry('smart-filters', 'Smart filters', 'partial', 'partial', 'Supported local settings and original filter descriptors are retained, but masks, ordering behavior, and every filter dialog are not complete.', 'packages/editor/src/editor/psd.test.ts'),
  entry('channels', 'Alpha channels', 'editable', 'editable', 'Named alpha-channel metadata and pixels can be imported, edited, and exported.', 'packages/editor/src/editor/psd.test.ts'),
  entry('document-metadata', 'Guides, resolution, XMP, linked files, and Layer Comps descriptors', 'preserved', 'preserved', 'Known document resources round-trip opaquely; Layer Comps do not yet have an editable Studio panel.', 'packages/editor/src/editor/psd.test.ts'),
  entry('animation', 'Frame and timeline metadata', 'rasterized', 'unsupported', 'Layer pixels remain available, but Photoshop animation descriptors are not imported into the Studio timeline.', 'packages/editor/src/editor/psd.test.ts'),
  entry('unknown-descriptors', 'Unknown Photoshop descriptors', 'partial', 'partial', 'Effects, placed-layer, smart-filter, linked-file, and document-resource descriptors are retained where modeled; arbitrary unknown blocks are not yet lossless.', 'packages/editor/src/editor/psd.test.ts'),
] as const
