import type { DocumentMeasurement, DocumentMeasurementScale } from './types'

export function measurementMetrics(measurement: Pick<DocumentMeasurement, 'startX' | 'startY' | 'endX' | 'endY'>, scale: DocumentMeasurementScale) {
  const deltaX = measurement.endX - measurement.startX
  const deltaY = measurement.endY - measurement.startY
  const pixels = Math.hypot(deltaX, deltaY)
  return {
    deltaX,
    deltaY,
    pixels,
    value: pixels / Math.max(0.000001, scale.pixelsPerUnit),
    angle: Math.atan2(deltaY, deltaX) * 180 / Math.PI,
  }
}

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function measurementsCsv(measurements: readonly DocumentMeasurement[], scale: DocumentMeasurementScale) {
  const rows = measurements.map((measurement) => {
    const metrics = measurementMetrics(measurement, scale)
    return [measurement.name, measurement.startX, measurement.startY, measurement.endX, measurement.endY, metrics.pixels, metrics.value, scale.unit, metrics.angle]
      .map(csvCell)
      .join(',')
  })
  return ['Name,Start X,Start Y,End X,End Y,Pixels,Calibrated length,Unit,Angle degrees', ...rows].join('\n')
}
