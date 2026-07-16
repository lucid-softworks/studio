import { createId, createShapeLayer, initialDocument } from './presets'
import type { DocumentPath, EditorDocument, Position, ShapeLayer, VectorPath } from './types'

const number = (value: number) => Math.round(value * 1000) / 1000
const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

function transformPoint(point: Position, layer: ShapeLayer, document: EditorDocument) {
  const width = document.canvasSize.width * layer.width / 100
  const height = document.canvasSize.height * layer.height / 100
  const center = { x: document.canvasSize.width / 2 + layer.position.x * document.canvasSize.width, y: document.canvasSize.height / 2 + layer.position.y * document.canvasSize.height }
  const local = { x: ((layer.flipX ? 1 - point.x : point.x) - 0.5) * width, y: ((layer.flipY ? 1 - point.y : point.y) - 0.5) * height }
  const angle = layer.rotation * Math.PI / 180
  return { x: center.x + local.x * Math.cos(angle) - local.y * Math.sin(angle), y: center.y + local.x * Math.sin(angle) + local.y * Math.cos(angle) }
}

export function vectorPathData(paths: VectorPath[], width = 1, height = 1) {
  return paths.map((path) => {
    const point = (value: Position) => `${number(value.x * width)} ${number(value.y * height)}`
    const first = path.knots[0]
    if (!first) return ''
    let data = `M ${point(first.anchor)}`
    for (let index = 1; index < path.knots.length; index += 1) {
      const previous = path.knots[index - 1]
      const current = path.knots[index]
      data += ` C ${point(previous.out)} ${point(current.in)} ${point(current.anchor)}`
    }
    if (path.closed) data += ` C ${point(path.knots.at(-1)!.out)} ${point(first.in)} ${point(first.anchor)} Z`
    return data
  }).join(' ')
}

function documentVectorPaths(layer: ShapeLayer, document: EditorDocument): VectorPath[] {
  const paths = layer.shape === 'path' && layer.vectorPaths?.length ? layer.vectorPaths : layer.shape === 'ellipse'
    ? [{ closed: true, operation: 'combine' as const, fillRule: 'non-zero' as const, knots: [
      { linked: true, in: { x: 0, y: 0.224 }, anchor: { x: 0.5, y: 0 }, out: { x: 1, y: 0.224 } },
      { linked: true, in: { x: 0.776, y: 0 }, anchor: { x: 1, y: 0.5 }, out: { x: 0.776, y: 1 } },
      { linked: true, in: { x: 1, y: 0.776 }, anchor: { x: 0.5, y: 1 }, out: { x: 0, y: 0.776 } },
      { linked: true, in: { x: 0.224, y: 1 }, anchor: { x: 0, y: 0.5 }, out: { x: 0.224, y: 0 } },
    ] }]
    : [{ closed: true, operation: 'combine' as const, fillRule: 'non-zero' as const, knots: [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => ({ linked: true, in: { x, y }, anchor: { x, y }, out: { x, y } })) }]
  return paths.map((path) => ({ ...path, knots: path.knots.map((knot) => ({ ...knot, in: transformPoint(knot.in, layer, document), anchor: transformPoint(knot.anchor, layer, document), out: transformPoint(knot.out, layer, document) })) }))
}

export function exportSvgDocument(document: EditorDocument) {
  const shapes = document.layers.filter((layer): layer is ShapeLayer => layer.type === 'shape' && layer.visible)
  const body = shapes.map((layer) => {
    const paths = documentVectorPaths(layer, document)
    const normalizedPaths = paths.map((path) => ({ ...path, knots: path.knots.map((knot) => ({ ...knot, in: { x: knot.in.x / document.canvasSize.width, y: knot.in.y / document.canvasSize.height }, anchor: { x: knot.anchor.x / document.canvasSize.width, y: knot.anchor.y / document.canvasSize.height }, out: { x: knot.out.x / document.canvasSize.width, y: knot.out.y / document.canvasSize.height } })) }))
    const metadata = encodeURIComponent(JSON.stringify(normalizedPaths))
    const fillMetadata = encodeURIComponent(JSON.stringify(layer.fillStyle ?? null))
    const strokeMetadata = encodeURIComponent(JSON.stringify(layer.strokeStyle ?? null))
    const dash = layer.strokeStyle?.dashes.length ? ` stroke-dasharray="${layer.strokeStyle.dashes.join(' ')}"` : ''
    return `<path id="${escapeXml(layer.id)}" data-studio-name="${escapeXml(layer.name)}" data-studio-vector="${metadata}" data-studio-fill="${fillMetadata}" data-studio-stroke="${strokeMetadata}" d="${vectorPathData(paths)}" fill="${escapeXml(layer.fill)}" stroke="${escapeXml(layer.stroke)}" stroke-width="${number(layer.strokeWidth)}" stroke-linecap="${layer.strokeStyle?.cap ?? 'butt'}" stroke-linejoin="${layer.strokeStyle?.join ?? 'miter'}" fill-rule="${paths.some((path) => path.fillRule === 'even-odd' || path.operation !== 'combine') ? 'evenodd' : 'nonzero'}" opacity="${number(layer.opacity / 100)}"${dash}/>`
  }).join('\n  ')
  const pathMetadata = encodeURIComponent(JSON.stringify(document.paths ?? []))
  return new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${document.canvasSize.width}" height="${document.canvasSize.height}" viewBox="0 0 ${document.canvasSize.width} ${document.canvasSize.height}" data-studio-document-paths="${pathMetadata}">\n  ${body}\n</svg>`], { type: 'image/svg+xml' })
}

function parsePathData(data: string, width: number, height: number): VectorPath[] {
  const tokens = data.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) ?? []
  const paths: VectorPath[] = []
  let index = 0
  let command = ''
  let point = { x: 0, y: 0 }
  let start = point
  let current: VectorPath | null = null
  let lastControl: Position | null = null
  const read = () => Number(tokens[index++])
  const position = (x: number, y: number, relative: boolean) => ({ x: (relative ? point.x + x : x), y: (relative ? point.y + y : y) })
  const normalize = (value: Position) => ({ x: value.x / width, y: value.y / height })
  const begin = (value: Position) => {
    current = { closed: false, operation: 'combine', fillRule: 'non-zero', knots: [{ linked: true, in: normalize(value), anchor: normalize(value), out: normalize(value) }] }
    paths.push(current)
    point = value
    start = value
  }
  const line = (value: Position, controlIn = value, controlOut = point) => {
    if (!current) begin(point)
    current!.knots.at(-1)!.out = normalize(controlOut)
    current!.knots.push({ linked: false, in: normalize(controlIn), anchor: normalize(value), out: normalize(value) })
    point = value
  }
  while (index < tokens.length) {
    if (/^[a-z]$/i.test(tokens[index])) command = tokens[index++]
    if (!command) break
    const relative = command === command.toLowerCase()
    const kind = command.toUpperCase()
    if (kind === 'Z') {
      const closing = paths.at(-1)
      if (closing) closing.closed = true
      point = start
      command = ''
      continue
    }
    if (kind === 'M') {
      const next = position(read(), read(), relative)
      begin(next)
      command = relative ? 'l' : 'L'
    } else if (kind === 'L') line(position(read(), read(), relative))
    else if (kind === 'H') line({ x: relative ? point.x + read() : read(), y: point.y })
    else if (kind === 'V') line({ x: point.x, y: relative ? point.y + read() : read() })
    else if (kind === 'C') {
      const controlOut = position(read(), read(), relative)
      const controlIn = position(read(), read(), relative)
      const next = position(read(), read(), relative)
      line(next, controlIn, controlOut)
      lastControl = controlIn
    } else if (kind === 'S') {
      const controlOut = lastControl ? { x: point.x * 2 - lastControl.x, y: point.y * 2 - lastControl.y } : point
      const controlIn = position(read(), read(), relative)
      const next = position(read(), read(), relative)
      line(next, controlIn, controlOut)
      lastControl = controlIn
    } else if (kind === 'Q') {
      const control = position(read(), read(), relative)
      const next = position(read(), read(), relative)
      line(next, { x: next.x + (control.x - next.x) * 2 / 3, y: next.y + (control.y - next.y) * 2 / 3 }, { x: point.x + (control.x - point.x) * 2 / 3, y: point.y + (control.y - point.y) * 2 / 3 })
      lastControl = control
    } else if (kind === 'A') {
      index += 5
      line(position(read(), read(), relative))
    } else break
  }
  return paths.filter((path) => path.knots.length > 1)
}

function svgSize(root: SVGSVGElement) {
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number)
  const width = viewBox?.[2] || Number.parseFloat(root.getAttribute('width') ?? '') || 1000
  const height = viewBox?.[3] || Number.parseFloat(root.getAttribute('height') ?? '') || 1000
  return { width, height }
}

export async function importSvgFile(file: File) {
  const parsed = new DOMParser().parseFromString(await file.text(), 'image/svg+xml')
  if (parsed.querySelector('parsererror')) throw new Error('The SVG markup could not be parsed.')
  const root = parsed.documentElement as unknown as SVGSVGElement
  const size = svgSize(root)
  const layers = [...parsed.querySelectorAll('path')].flatMap((element, layerIndex) => {
    let paths: VectorPath[]
    try { paths = element.dataset.studioVector ? JSON.parse(decodeURIComponent(element.dataset.studioVector)) as VectorPath[] : parsePathData(element.getAttribute('d') ?? '', size.width, size.height) } catch { paths = [] }
    if (!paths.length) return []
    const layer = createShapeLayer('path', layerIndex + 1)
    layer.id = element.id || createId()
    layer.name = element.dataset.studioName || element.id || `Path ${layerIndex + 1}`
    layer.width = 100
    layer.height = 100
    layer.position = { x: 0, y: 0 }
    layer.vectorPaths = paths
    layer.fill = element.getAttribute('fill') || '#000000'
    layer.stroke = element.getAttribute('stroke') || '#000000'
    layer.strokeWidth = Number.parseFloat(element.getAttribute('stroke-width') ?? '') || 0
    layer.opacity = Math.round((Number.parseFloat(element.getAttribute('opacity') ?? '') || 1) * 100)
    try { layer.fillStyle = element.dataset.studioFill ? JSON.parse(decodeURIComponent(element.dataset.studioFill)) : undefined } catch { /* optional metadata */ }
    try { layer.strokeStyle = element.dataset.studioStroke ? JSON.parse(decodeURIComponent(element.dataset.studioStroke)) : undefined } catch { /* optional metadata */ }
    return [layer]
  })
  if (!layers.length) throw new Error('The SVG did not contain an editable path.')
  let documentPaths: DocumentPath[] = []
  try { documentPaths = root.dataset.studioDocumentPaths ? JSON.parse(decodeURIComponent(root.dataset.studioDocumentPaths)) : [] } catch { /* optional metadata */ }
  const selectedLayerId = layers.at(-1)?.id ?? null
  return { assets: {}, document: { ...structuredClone(initialDocument), canvasPreset: 'custom', canvasSize: size, background: { ...initialDocument.background, kind: 'transparent' as const }, layers, selectedLayerId, selectedLayerIds: selectedLayerId ? [selectedLayerId] : [], paths: documentPaths, selectedPathId: documentPaths.at(-1)?.id ?? null } }
}
