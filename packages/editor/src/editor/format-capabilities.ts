import type { PsdCompatibilityStatus } from './psd-compatibility'

export type FormatCapability = {
  id: string
  label: string
  extensions: readonly string[]
  import: PsdCompatibilityStatus
  export: PsdCompatibilityStatus
  detail: string
}

const format = (
  id: string,
  label: string,
  extensions: readonly string[],
  importStatus: PsdCompatibilityStatus,
  exportStatus: PsdCompatibilityStatus,
  detail: string,
): FormatCapability => ({ id, label, extensions, import: importStatus, export: exportStatus, detail })

export const formatCapabilities: readonly FormatCapability[] = [
  format('studio', 'Studio project', ['.studio'], 'editable', 'editable', 'Canonical local project format; layers, masks, resources, precision metadata, animation, and editor state remain editable.'),
  format('psd-psb', 'Photoshop document', ['.psd', '.psb'], 'partial', 'partial', 'Layered import and export with explicit preservation and compatibility warnings. Some Photoshop-only descriptors remain opaque or unpreviewed.'),
  format('png', 'Portable Network Graphics', ['.png'], 'editable', 'rasterized', 'Imports as editable raster pixels. Export flattens the visible document to one lossless RGBA image.'),
  format('jpeg', 'JPEG image', ['.jpg', '.jpeg'], 'editable', 'rasterized', 'Imports as editable raster pixels. Export flattens the document and removes transparency.'),
  format('webp', 'WebP image', ['.webp'], 'editable', 'rasterized', 'Imports as editable raster pixels. Export flattens the visible document to a WebP image.'),
  format('avif', 'AVIF image', ['.avif'], 'editable', 'rasterized', 'Imports as editable raster pixels through a local codec. Export is a flattened local encode.'),
  format('svg', 'Scalable Vector Graphics', ['.svg'], 'partial', 'partial', 'Supported shapes, paths, fills, strokes, and text remain editable; unsupported SVG features may be simplified.'),
  format('tiff', 'TIFF image', ['.tif', '.tiff'], 'partial', 'rasterized', 'Common and multipage TIFFs import locally. Export writes a composite plus named layer pages, not Photoshop-private editable layer blocks.'),
  format('pdf', 'PDF document', ['.pdf'], 'rasterized', 'rasterized', 'Pages import as raster layers. Export produces a flattened local PDF rather than editable PDF text and vectors.'),
  format('gif-apng', 'GIF and animated PNG', ['.gif', '.apng'], 'partial', 'rasterized', 'Raster content imports locally; animation metadata coverage is partial. Animated exports are generated from Studio layers or frames.'),
  format('heic', 'HEIC / HEIF image', ['.heic', '.heif'], 'rasterized', 'unsupported', 'A local decoder creates editable raster pixels. Studio does not currently encode HEIC or HEIF.'),
  format('ico', 'Windows icon', ['.ico'], 'rasterized', 'unsupported', 'The selected icon bitmap imports as raster pixels. Multi-size editable icon export is not available.'),
  format('raw', 'Camera RAW family', ['.dng', '.cr2', '.nef', '.arw', '.orf', '.rw2'], 'converted', 'unsupported', 'A displayable embedded preview imports when present; sensor demosaicing and RAW export are not available.'),
  format('hdr-exr', 'HDR and OpenEXR', ['.hdr', '.exr'], 'converted', 'unsupported', 'Linear float pixels are retained in precision backing data with an 8-bit display preview. Direct HDR or EXR export is not exposed.'),
] as const

export const formatCapabilityStatuses: readonly PsdCompatibilityStatus[] = ['editable', 'partial', 'preserved', 'converted', 'rasterized', 'unsupported']
