import { describe, expect, it } from 'vitest'
import { adjustmentKinds, createAdjustmentDescriptor } from './adjustments'

describe('adjustment descriptors', () => {
  it('provides serializable defaults for every editable kind', () => {
    const values = adjustmentKinds.map(({ value }) => createAdjustmentDescriptor(value))
    expect(values.map((value) => value.type)).toEqual(adjustmentKinds.map((value) => value.value))
    expect(() => structuredClone(values)).not.toThrow()
  })
})
