import type { Position } from './types'

export type BrushStamp = Position & { pressure: number }
export type DynamicBrushStamp = BrushStamp & { angle: number; scaleX: number; scaleY: number; hue: number; saturation: number; brightness: number; texture: number }
export type PointerBrushInput = { pressure: number; tilt: number; twist: number; barrel: boolean }

type Dynamics = {
  scatter: number
  count: number
  angleJitter: number
  roundness: number
  texture: number
  dualBrush: boolean
  hueJitter: number
  saturationJitter: number
  brightnessJitter: number
  smoothing: number
  buildUp: boolean
  tiltSize: boolean
  twistRotation: boolean
}

export function normalizePointerPressure(pointerType: string, pressure: number) {
  if (pointerType !== 'pen') return 1
  return Math.max(0.05, Math.min(1, pressure || 0.05))
}

export function normalizePointerInput(pointerType: string, pressure: number, tiltX: number, tiltY: number, twist: number, buttons: number, calibration = { minimum: 0, maximum: 1, gamma: 1 }): PointerBrushInput {
  const raw = normalizePointerPressure(pointerType, pressure)
  const range = Math.max(0.01, calibration.maximum - calibration.minimum)
  const calibrated = Math.max(0, Math.min(1, (raw - calibration.minimum) / range))
  return {
    pressure: Math.max(0.01, Math.min(1, calibrated ** Math.max(0.1, calibration.gamma))),
    tilt: Math.min(1, Math.hypot(tiltX, tiltY) / 90),
    twist: ((twist % 360) + 360) % 360,
    barrel: pointerType === 'pen' && Boolean(buttons & 2),
  }
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

function seededRandom(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0xffffffff
  }
}

export function smoothBrushPoint(previous: Position, target: Position, smoothing: number): Position {
  const follow = Math.max(0.04, 1 - Math.max(0, Math.min(100, smoothing)) / 105)
  return { x: previous.x + (target.x - previous.x) * follow, y: previous.y + (target.y - previous.y) * follow }
}

export function dynamicBrushStamps(stamps: BrushStamp[], diameter: number, dynamics: Dynamics, input: PointerBrushInput, seed: number): DynamicBrushStamp[] {
  const random = seededRandom(seed)
  return stamps.flatMap((stamp) => Array.from({ length: Math.max(1, Math.round(dynamics.count)) }, () => {
    const angle = (dynamics.twistRotation ? input.twist : 0) + (random() * 2 - 1) * dynamics.angleJitter
    const scatterRadius = diameter * dynamics.scatter / 100
    const scatterAngle = random() * Math.PI * 2
    const tiltScale = dynamics.tiltSize ? 1 - input.tilt * 0.55 : 1
    return {
      ...stamp,
      x: stamp.x + Math.cos(scatterAngle) * scatterRadius * random(),
      y: stamp.y + Math.sin(scatterAngle) * scatterRadius * random(),
      angle,
      scaleX: tiltScale,
      scaleY: Math.max(0.05, dynamics.roundness / 100) * tiltScale,
      hue: (random() * 2 - 1) * dynamics.hueJitter,
      saturation: (random() * 2 - 1) * dynamics.saturationJitter,
      brightness: (random() * 2 - 1) * dynamics.brightnessJitter,
      texture: 1 - random() * dynamics.texture / 100,
    }
  }))
}
