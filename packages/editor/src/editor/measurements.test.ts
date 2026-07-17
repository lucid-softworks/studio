import { describe, expect, it } from 'vitest'
import { measurementMetrics, measurementsCsv } from './measurements'

describe('measurements', () => {
  it('converts pixel distance through the document calibration', () => {
    expect(measurementMetrics({ startX: 10, startY: 20, endX: 40, endY: 60 }, { pixelsPerUnit: 10, unit: 'mm' })).toMatchObject({ deltaX: 30, deltaY: 40, pixels: 50, value: 5 })
  })

  it('exports deterministic escaped CSV records', () => {
    const csv = measurementsCsv([{ id: 'one', name: 'Header, width', startX: 0, startY: 0, endX: 30, endY: 40 }], { pixelsPerUnit: 5, unit: 'mm' })
    expect(csv).toContain('"Header, width",0,0,30,40,50,10,mm')
    expect(csv.split('\n')).toHaveLength(2)
  })
})
