export type SnapBounds = { x: number; y: number; width: number; height: number }
export type SnapResult = { dx: number; dy: number; xGuide?: number; yGuide?: number }

function snapAxis(anchors: number[], delta: number, targets: number[], gridSpacing: number | undefined, threshold: number) {
  let bestDistance = threshold + 1
  let adjustment = 0
  let guide: number | undefined
  for (const anchor of anchors) {
    const moved = anchor + delta
    const candidates = gridSpacing && gridSpacing > 0 ? [...targets, Math.round(moved / gridSpacing) * gridSpacing] : targets
    for (const target of candidates) {
      const distance = Math.abs(target - moved)
      if (distance >= bestDistance) continue
      bestDistance = distance
      adjustment = target - moved
      guide = target
    }
  }
  return bestDistance <= threshold ? { delta: delta + adjustment, guide } : { delta }
}

export function snapTranslation(bounds: SnapBounds, dx: number, dy: number, xTargets: number[], yTargets: number[], gridSpacing: number | undefined, threshold: number): SnapResult {
  const x = snapAxis([bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width], dx, xTargets, gridSpacing, threshold)
  const y = snapAxis([bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height], dy, yTargets, gridSpacing, threshold)
  return { dx: x.delta, dy: y.delta, xGuide: x.guide, yGuide: y.guide }
}
