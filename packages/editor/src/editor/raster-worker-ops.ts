export type GradientSelectionConstraint = {
  data: ArrayBuffer
  width: number
  height: number
  target: { surfaceWidth: number; surfaceHeight: number; bounds: { x: number; y: number; width: number; height: number; rotation: number } }
}

export type LinearGradientOperation = {
  data: ArrayBuffer
  width: number
  height: number
  start: { x: number; y: number }
  end: { x: number; y: number }
  stops: Array<{ position: number; color: [number, number, number, number] }>
  selection?: GradientSelectionConstraint
}

function selectionSampler(selection: GradientSelectionConstraint) {
  const pixels = new Uint8ClampedArray(selection.data)
  const angle = selection.target.bounds.rotation * Math.PI / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const centerX = selection.target.bounds.x + selection.target.bounds.width / 2
  const centerY = selection.target.bounds.y + selection.target.bounds.height / 2
  return (sourceX: number, sourceY: number) => {
    const localX = (sourceX / selection.target.surfaceWidth - 0.5) * selection.target.bounds.width
    const localY = (sourceY / selection.target.surfaceHeight - 0.5) * selection.target.bounds.height
    const documentX = Math.round(centerX + localX * cosine - localY * sine)
    const documentY = Math.round(centerY + localX * sine + localY * cosine)
    if (documentX < 0 || documentY < 0 || documentX >= selection.width || documentY >= selection.height) return 0
    return pixels[(documentY * selection.width + documentX) * 4 + 3] / 255
  }
}

export function generateLinearGradient(request: LinearGradientOperation, onProgress?: (progress: number) => void) {
  const before = new Uint8ClampedArray(request.data)
  const after = new Uint8ClampedArray(request.width * request.height * 4)
  const dx = request.end.x - request.start.x
  const dy = request.end.y - request.start.y
  const lengthSquared = Math.max(1, dx * dx + dy * dy)
  const coverageAt = request.selection ? selectionSampler(request.selection) : null
  const progressRows = Math.max(1, Math.floor(request.height / 100))
  for (let y = 0; y < request.height; y += 1) {
    for (let x = 0; x < request.width; x += 1) {
      const position = Math.max(0, Math.min(1, ((x - request.start.x) * dx + (y - request.start.y) * dy) / lengthSquared)) * 100
      const rightIndex = Math.max(1, request.stops.findIndex((stop) => stop.position >= position))
      const leftStop = request.stops[rightIndex - 1]
      const rightStop = request.stops[rightIndex] ?? request.stops.at(-1)!
      const amount = Math.max(0, Math.min(1, (position - leftStop.position) / Math.max(0.001, rightStop.position - leftStop.position)))
      const offset = (y * request.width + x) * 4
      const coverage = coverageAt?.(x, y) ?? 1
      for (let channel = 0; channel < 4; channel += 1) {
        const generated = leftStop.color[channel] + (rightStop.color[channel] - leftStop.color[channel]) * amount
        after[offset + channel] = Math.round(before[offset + channel] * (1 - coverage) + generated * coverage)
      }
    }
    if ((y + 1) % progressRows === 0 || y + 1 === request.height) onProgress?.((y + 1) / request.height)
  }
  return after
}
