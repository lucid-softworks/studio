import type { Position } from './types'

export type BrushStamp = Position & { pressure: number }

export function normalizePointerPressure(pointerType: string, pressure: number) {
  if (pointerType !== 'pen') return 1
  return Math.max(0.05, Math.min(1, pressure || 0.05))
}

export function interpolateBrushStamps(from: Position, to: Position, fromPressure: number, toPressure: number, diameter: number, spacingPercent: number): BrushStamp[] {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const spacing = Math.max(1, diameter * Math.max(1, spacingPercent) / 100)
  const steps = Math.max(1, Math.ceil(distance / spacing))
  return Array.from({ length: steps }, (_, index) => {
    const progress = distance === 0 ? 0 : (index + 1) / steps
    return {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      pressure: fromPressure + (toPressure - fromPressure) * progress,
    }
  })
}

export function brushStampRadius(radius: number, pressure: number, pressureSize: boolean) {
  return radius * (pressureSize ? pressure : 1)
}

export function brushStampAlpha(opacity: number, flow: number, pressure: number, pressureOpacity: boolean) {
  return Math.max(0, Math.min(1, opacity / 100 * flow / 100 * (pressureOpacity ? pressure : 1)))
}
