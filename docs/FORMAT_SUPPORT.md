# Format support

Studio performs all decoding and encoding on the user’s device. Codec bundles are loaded only when their format is used.

| Format | Import | Export and round-trip behavior |
| --- | --- | --- |
| Studio | Full document, assets, precision, animation, slices, print settings, and metadata | Canonical lossless editable project format |
| PSD / PSB | Layers, groups, masks, text, effects, smart objects, channels, guides, resources, and compatible 8/16/32-bit pixels | Layered PSD and large-document PSB; unsupported Photoshop descriptors are preserved where possible and flattening is reported on import |
| TIFF | Multi-page and common compressed TIFF variants | Standard uncompressed multi-page RGBA TIFF: page 1 is the composite and following pages are named layers; Photoshop-private TIFF layer blocks are not emitted |
| RAW | Local TIFF-based camera preview decode for DNG, CR2, NEF, ARW, ORF, and RW2 when a displayable IFD exists | No RAW export or sensor demosaicing; Studio explicitly reports when it opened an embedded preview |
| OpenEXR / Radiance HDR | Linear float RGBA is retained in Studio’s 32-bit backing store; an ACES preview is shown | Use Studio/PSD/PSB to retain editing precision; direct EXR/HDR export is not currently exposed |
| HEIF / AVIF / ICO | Local browser or Wasm decode | AVIF export is local Wasm; HEIF and ICO are import-only |
| PDF | Every page is rendered locally at 144 ppi into a separate layer | Composition and print-ready PDF export; imported PDF text and vectors are rasterized with a warning |
| SVG | Editable supported shapes and text | Editable SVG where Studio features map to SVG; raster/effect fallbacks are embedded or flattened |
| GIF / APNG | Browser image decode as a flattened raster | Frame and keyframe timeline export with timing and looping |
| PNG / JPEG / WebP | Browser decode with resolution, EXIF, XMP, ICC, and orientation metadata captured where present | PNG/JPEG metadata is re-embedded unless “Strip metadata” is selected. Pixel orientation is normalized and the emitted EXIF orientation is set to 1 to prevent double rotation. WebP metadata remains in Studio projects but browser WebP exports are intentionally clean. |

Studio projects retain imported metadata even when the chosen destination format cannot represent it. The Export Assets workspace makes metadata stripping an explicit choice.
