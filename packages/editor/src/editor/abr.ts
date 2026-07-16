import type { BrushPreset } from './resources'

class Reader {
  offset = 0
  readonly bytes: Uint8Array
  constructor(bytes: Uint8Array) { this.bytes = bytes }
  get remaining() { return this.bytes.length - this.offset }
  u8() { return this.bytes[this.offset++] }
  u16() { const value = (this.u8() << 8) | this.u8(); return value >>> 0 }
  i16() { const value = this.u16(); return value > 0x7fff ? value - 0x10000 : value }
  u32() { return (this.u16() * 0x10000 + this.u16()) >>> 0 }
  i32() { const value = this.u32(); return value > 0x7fffffff ? value - 0x100000000 : value }
  skip(length: number) { this.offset = Math.min(this.bytes.length, this.offset + length) }
  ascii(length: number) { return String.fromCharCode(...this.bytes.slice(this.offset, this.offset += length)) }
}

function packBits(bytes: Uint8Array, rowLengths: number[], width: number, height: number) {
  const output = new Uint8Array(width * height)
  let source = 0
  for (let row = 0; row < height; row += 1) {
    const rowEnd = source + rowLengths[row]
    let destination = row * width
    while (source < rowEnd && destination < (row + 1) * width) {
      const header = bytes[source++]
      if (header <= 127) {
        const count = header + 1
        output.set(bytes.subarray(source, source + count), destination)
        source += count
        destination += count
      } else if (header >= 129) {
        const count = 257 - header
        output.fill(bytes[source++], destination, destination + count)
        destination += count
      }
    }
    source = rowEnd
  }
  return output
}

function grayscaleTip(data: Uint8Array, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('ABR brush tips need Canvas2D.')
  const image = context.createImageData(width, height)
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4
    image.data[offset] = 255
    image.data[offset + 1] = 255
    image.data[offset + 2] = 255
    image.data[offset + 3] = 255 - data[pixel]
  }
  context.putImageData(image, 0, 0)
  return canvas
}

function computedTip(diameter: number, roundness: number, angle: number, hardness: number) {
  const size = Math.max(8, Math.min(512, diameter))
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('ABR brush tips need Canvas2D.')
  context.translate(size / 2, size / 2)
  context.rotate(angle * Math.PI / 180)
  context.scale(1, Math.max(0.05, roundness / 100))
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, size / 2)
  gradient.addColorStop(0, '#fff')
  if (hardness) gradient.addColorStop(Math.min(0.99, hardness / 100), '#fff')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.beginPath()
  context.arc(0, 0, size / 2, 0, Math.PI * 2)
  context.fill()
  return canvas
}

function sampledBrush(reader: Reader, end: number, name: string, spacing: number) {
  reader.skip(1)
  reader.skip(8)
  const top = reader.i32()
  const left = reader.i32()
  const bottom = reader.i32()
  const right = reader.i32()
  const width = right - left
  const height = bottom - top
  const depth = reader.u16()
  const compression = reader.u16()
  if (depth !== 8 || width <= 0 || height <= 0 || width > 8192 || height > 8192) throw new Error('The ABR contains an unsupported sampled brush depth or size.')
  let pixels: Uint8Array
  if (compression === 0) pixels = reader.bytes.slice(reader.offset, reader.offset + width * height)
  else if (compression === 1) {
    const lengths = Array.from({ length: height }, () => reader.u16())
    pixels = packBits(reader.bytes.slice(reader.offset, end), lengths, width, height)
  } else throw new Error('The ABR contains an unsupported brush compression mode.')
  reader.offset = end
  return { id: crypto.randomUUID(), name, spacing: Math.max(1, Math.min(100, spacing)), tip: grayscaleTip(pixels, width, height) } satisfies BrushPreset
}

function unicodeName(reader: Reader) {
  const length = reader.u32()
  if (!length || length > reader.remaining / 2) return ''
  const units = Array.from({ length }, () => reader.u16())
  if (units.at(-1) === 0) units.pop()
  return String.fromCharCode(...units)
}

function parseLegacy(reader: Reader, count: number, version: number) {
  const brushes: BrushPreset[] = []
  for (let index = 0; index < count && reader.remaining >= 6; index += 1) {
    const type = reader.u16()
    const size = reader.u32()
    const end = Math.min(reader.bytes.length, reader.offset + size)
    let name = `ABR Brush ${index + 1}`
    reader.u32()
    const spacing = reader.u16()
    if (type === 1) {
      const diameter = reader.u16()
      const roundness = reader.u16()
      const angle = reader.i16()
      const hardness = reader.u16()
      brushes.push({ id: crypto.randomUUID(), name, spacing: Math.max(1, Math.min(100, spacing)), tip: computedTip(diameter, roundness, angle, hardness), dynamics: { roundness, twistRotation: false, angleJitter: 0 } })
      reader.offset = end
    } else if (type === 2) {
      if (version === 2) name = unicodeName(reader) || name
      brushes.push(sampledBrush(reader, end, name, spacing))
    }
    else reader.offset = end
  }
  return brushes
}

function parseModernSample(reader: Reader, end: number, index: number, subversion: number) {
  reader.skip(37)
  reader.skip(subversion === 1 ? 10 : 264)
  const top = reader.i32()
  const left = reader.i32()
  const bottom = reader.i32()
  const right = reader.i32()
  const width = right - left
  const height = bottom - top
  const depth = reader.u16()
  const compression = reader.u8()
  if (depth !== 8 || width <= 0 || height <= 0 || width > 8192 || height > 8192) return null
  let pixels: Uint8Array
  if (compression === 0) pixels = reader.bytes.slice(reader.offset, reader.offset + width * height)
  else if (compression === 1) {
    const lengths = Array.from({ length: height }, () => reader.u16())
    pixels = packBits(reader.bytes.slice(reader.offset, end), lengths, width, height)
  } else return null
  return { id: crypto.randomUUID(), name: `ABR Brush ${index + 1}`, spacing: 18, tip: grayscaleTip(pixels, width, height) } satisfies BrushPreset
}

function parseModernV6(reader: Reader, subversion: number) {
  if (subversion !== 1 && subversion !== 2) throw new Error(`ABR version 6.${subversion} is not supported.`)
  let sampleStart = -1
  let sampleEnd = -1
  while (reader.remaining >= 12) {
    if (reader.ascii(4) !== '8BIM') break
    const tag = reader.ascii(4)
    const size = reader.u32()
    const end = Math.min(reader.bytes.length, reader.offset + size)
    if (tag === 'samp') { sampleStart = reader.offset; sampleEnd = end; break }
    reader.offset = end
  }
  if (sampleStart < 0) throw new Error('The ABR does not contain a sampled-tip section.')
  reader.offset = sampleStart
  const brushes: BrushPreset[] = []
  while (reader.offset + 4 <= sampleEnd) {
    const size = reader.u32()
    const paddedSize = size + ((4 - size % 4) % 4)
    const end = Math.min(sampleEnd, reader.offset + size)
    if (size < 64 || end <= reader.offset) break
    const brush = parseModernSample(reader, end, brushes.length, subversion)
    if (brush) brushes.push(brush)
    reader.offset = Math.min(sampleEnd, end + (paddedSize - size))
  }
  if (!brushes.length) throw new Error('The ABR sampled-tip section does not contain a compatible 8-bit brush.')
  return brushes
}

/**
 * Parses documented legacy ABR brushes plus the sampled-tip blocks used by
 * Photoshop 7 and newer version-6 brush packs.
 */
export function parseAbrBuffer(buffer: ArrayBuffer): BrushPreset[] {
  const reader = new Reader(new Uint8Array(buffer))
  if (reader.remaining < 4) throw new Error('That ABR file is truncated.')
  const version = reader.u16()
  if (version === 1 || version === 2) {
    const brushes = parseLegacy(reader, reader.u16(), version)
    if (!brushes.length) throw new Error('The ABR does not contain a supported computed or sampled brush.')
    return brushes
  }
  if (version === 6) return parseModernV6(reader, reader.u16())
  if (version === 7 || version === 10) throw new Error('This ABR pack does not expose a supported sampled-tip layout. Export its brushes as a version-6 ABR or PNG tips first.')
  throw new Error(`ABR version ${version} is not supported.`)
}
