import type { DocumentFileMetadata } from './types'

const ascii = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)
const utf8 = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

function readExifOrientation(exif: Uint8Array) {
  const start = ascii(exif.subarray(0, 6)) === 'Exif\0\0' ? 6 : 0
  if (exif.length < start + 8) return undefined
  const little = ascii(exif.subarray(start, start + 2)) === 'II'
  const view = new DataView(exif.buffer, exif.byteOffset + start, exif.byteLength - start)
  const ifd = view.getUint32(4, little)
  if (ifd + 2 > view.byteLength) return undefined
  const count = view.getUint16(ifd, little)
  for (let index = 0; index < count; index += 1) {
    const offset = ifd + 2 + index * 12
    if (offset + 12 > view.byteLength) break
    if (view.getUint16(offset, little) === 274) return view.getUint16(offset + 8, little)
  }
  return undefined
}

function normalizedExif(exif: Uint8Array) {
  const output = exif.slice()
  const start = ascii(output.subarray(0, 6)) === 'Exif\0\0' ? 6 : 0
  if (output.length < start + 8) return output
  const little = ascii(output.subarray(start, start + 2)) === 'II'
  const view = new DataView(output.buffer, output.byteOffset + start, output.byteLength - start)
  const ifd = view.getUint32(4, little)
  if (ifd + 2 > view.byteLength) return output
  const count = view.getUint16(ifd, little)
  for (let index = 0; index < count; index += 1) {
    const offset = ifd + 2 + index * 12
    if (offset + 12 > view.byteLength) break
    if (view.getUint16(offset, little) === 274) { view.setUint16(offset + 8, 1, little); break }
  }
  return output
}

function jpegMetadata(bytes: Uint8Array): DocumentFileMetadata {
  const chunks: NonNullable<DocumentFileMetadata['containerChunks']> = []
  const iccParts: Uint8Array[] = []
  let exif: number[] | undefined; let xmp: string | undefined; let orientation: number | undefined; let resolutionDpi: number | undefined
  for (let offset = 2; offset + 4 <= bytes.length && bytes[offset] === 0xff;) {
    const marker = bytes[offset + 1]
    if (marker === 0xda || marker === 0xd9) break
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
    if (length < 2 || offset + length + 2 > bytes.length) break
    const payload = bytes.slice(offset + 4, offset + 2 + length)
    if (marker === 0xe0 && ascii(payload.subarray(0, 5)) === 'JFIF\0' && payload.length >= 12) {
      const units = payload[7]; const x = (payload[8] << 8) | payload[9]
      resolutionDpi = units === 2 ? x * 2.54 : units === 1 ? x : resolutionDpi
    } else if (marker === 0xe1 && ascii(payload.subarray(0, 6)) === 'Exif\0\0') {
      exif = Array.from(payload); orientation = readExifOrientation(payload); chunks.push({ container: 'jpeg', type: 'EXIF', data: exif })
    } else if (marker === 0xe1 && ascii(payload.subarray(0, 29)).startsWith('http://ns.adobe.com/xap/1.0/')) {
      const zero = payload.indexOf(0); xmp = utf8(payload.subarray(zero + 1)); chunks.push({ container: 'jpeg', type: 'XMP', data: Array.from(payload) })
    } else if (marker === 0xe2 && ascii(payload.subarray(0, 12)) === 'ICC_PROFILE\0') iccParts.push(payload.subarray(14))
    offset += length + 2
  }
  const icc = iccParts.length ? Array.from(Uint8Array.from(iccParts.flatMap((part) => Array.from(part)))) : undefined
  return { sourceFormat: 'jpeg', resolutionDpi, orientation, exif, xmp, icc, containerChunks: chunks, importedAt: new Date().toISOString() }
}

function pngMetadata(bytes: Uint8Array): DocumentFileMetadata {
  const chunks: NonNullable<DocumentFileMetadata['containerChunks']> = []
  let resolutionDpi: number | undefined; let exif: number[] | undefined; let xmp: string | undefined
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0)
    const type = ascii(bytes.subarray(offset + 4, offset + 8))
    if (offset + 12 + length > bytes.length) break
    const data = bytes.slice(offset + 8, offset + 8 + length)
    if (type === 'pHYs' && data.length >= 9 && data[8] === 1) resolutionDpi = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0) * 0.0254
    if (type === 'eXIf') exif = Array.from(data)
    if (type === 'iTXt' && ascii(data).startsWith('XML:com.adobe.xmp')) { const zeroes = [...data].flatMap((value, index) => value === 0 ? [index] : []); xmp = utf8(data.subarray((zeroes[4] ?? zeroes.at(-1) ?? -1) + 1)) }
    if (['eXIf', 'iTXt', 'iCCP'].includes(type)) chunks.push({ container: 'png', type, data: Array.from(data) })
    offset += length + 12
    if (type === 'IEND') break
  }
  return { sourceFormat: 'png', resolutionDpi, orientation: exif ? readExifOrientation(Uint8Array.from(exif)) : undefined, exif, xmp, containerChunks: chunks, importedAt: new Date().toISOString() }
}

function webpMetadata(bytes: Uint8Array): DocumentFileMetadata {
  const chunks: NonNullable<DocumentFileMetadata['containerChunks']> = []
  let exif: number[] | undefined; let xmp: string | undefined; let icc: number[] | undefined
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = ascii(bytes.subarray(offset, offset + 4))
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true)
    if (offset + 8 + length > bytes.length) break
    const data = bytes.slice(offset + 8, offset + 8 + length)
    if (type === 'EXIF') exif = Array.from(data)
    if (type === 'XMP ') xmp = utf8(data)
    if (type === 'ICCP') icc = Array.from(data)
    if (['EXIF', 'XMP ', 'ICCP'].includes(type)) chunks.push({ container: 'webp', type, data: Array.from(data) })
    offset += 8 + length + (length % 2)
  }
  return { sourceFormat: 'webp', orientation: exif ? readExifOrientation(Uint8Array.from(exif)) : undefined, exif, xmp, icc, containerChunks: chunks, importedAt: new Date().toISOString() }
}

export async function readImageMetadata(file: Blob & { type: string }): Promise<DocumentFileMetadata> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegMetadata(bytes)
  if (ascii(bytes.subarray(1, 4)) === 'PNG') return pngMetadata(bytes)
  if (ascii(bytes.subarray(0, 4)) === 'RIFF' && ascii(bytes.subarray(8, 12)) === 'WEBP') return webpMetadata(bytes)
  return { sourceFormat: file.type.replace(/^image\//, '') || 'image', importedAt: new Date().toISOString() }
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0) }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array) {
  const output = new Uint8Array(12 + data.length); const view = new DataView(output.buffer)
  view.setUint32(0, data.length); const typeBytes = new TextEncoder().encode(type); output.set(typeBytes, 4); output.set(data, 8)
  view.setUint32(8 + data.length, crc32(output.subarray(4, 8 + data.length)))
  return output
}

function injectPng(bytes: Uint8Array, metadata: DocumentFileMetadata) {
  let firstData = 8
  for (let offset = 8; offset + 12 <= bytes.length;) { const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0); const type = ascii(bytes.subarray(offset + 4, offset + 8)); if (type === 'IDAT') { firstData = offset; break }; offset += length + 12 }
  const chunks: Uint8Array[] = []
  if (metadata.resolutionDpi) { const data = new Uint8Array(9); const pixelsPerMeter = Math.round(metadata.resolutionDpi / 0.0254); const view = new DataView(data.buffer); view.setUint32(0, pixelsPerMeter); view.setUint32(4, pixelsPerMeter); data[8] = 1; chunks.push(pngChunk('pHYs', data)) }
  for (const chunk of metadata.containerChunks ?? []) if (chunk.container === 'png' && ['eXIf', 'iTXt', 'iCCP'].includes(chunk.type)) chunks.push(pngChunk(chunk.type, chunk.type === 'eXIf' ? normalizedExif(Uint8Array.from(chunk.data)) : Uint8Array.from(chunk.data)))
  if (metadata.xmp && !chunks.some((chunk) => ascii(chunk.subarray(4, 8)) === 'iTXt')) chunks.push(pngChunk('iTXt', new Uint8Array([...new TextEncoder().encode('XML:com.adobe.xmp'), 0, 0, 0, 0, 0, ...new TextEncoder().encode(metadata.xmp)])))
  const length = bytes.length + chunks.reduce((total, chunk) => total + chunk.length, 0); const output = new Uint8Array(length); output.set(bytes.subarray(0, firstData)); let offset = firstData; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length }; output.set(bytes.subarray(firstData), offset); return output
}

function jpegSegment(marker: number, payload: Uint8Array) { const output = new Uint8Array(payload.length + 4); output[0] = 0xff; output[1] = marker; output[2] = ((payload.length + 2) >> 8) & 255; output[3] = (payload.length + 2) & 255; output.set(payload, 4); return output }

function injectJpeg(bytes: Uint8Array, metadata: DocumentFileMetadata) {
  const segments: Uint8Array[] = []
  if (metadata.exif?.length && metadata.exif.length < 65_530) segments.push(jpegSegment(0xe1, normalizedExif(Uint8Array.from(metadata.exif))))
  if (metadata.xmp) { const header = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0'); const body = new TextEncoder().encode(metadata.xmp); if (header.length + body.length < 65_530) segments.push(jpegSegment(0xe1, new Uint8Array([...header, ...body]))) }
  if (metadata.icc?.length) { const data = Uint8Array.from(metadata.icc); const size = 65_519; const count = Math.ceil(data.length / size); for (let index = 0; index < count; index += 1) segments.push(jpegSegment(0xe2, new Uint8Array([...new TextEncoder().encode('ICC_PROFILE\0'), index + 1, count, ...data.subarray(index * size, (index + 1) * size)]))) }
  if (metadata.resolutionDpi) { const density = Math.max(1, Math.min(65_535, Math.round(metadata.resolutionDpi))); segments.unshift(jpegSegment(0xe0, new Uint8Array([...new TextEncoder().encode('JFIF\0'), 1, 2, 1, density >> 8, density & 255, density >> 8, density & 255, 0, 0]))) }
  const total = bytes.length + segments.reduce((sum, segment) => sum + segment.length, 0); const output = new Uint8Array(total); output.set(bytes.subarray(0, 2)); let offset = 2; for (const segment of segments) { output.set(segment, offset); offset += segment.length }; output.set(bytes.subarray(2), offset); return output
}

export async function applyImageMetadata(blob: Blob, format: string, metadata: DocumentFileMetadata, strip = false) {
  if (strip) return blob
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (format === 'png') return new Blob([injectPng(bytes, metadata)], { type: 'image/png' })
  if (format === 'jpeg' || format === 'jpg') return new Blob([injectJpeg(bytes, metadata)], { type: 'image/jpeg' })
  return blob
}
