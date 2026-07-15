import { describe, expect, it } from 'vitest'
import { historyCommandLabel } from './history-labels'

describe('history labels', () => {
  it('turns document commands into editor-facing descriptions', () => {
    expect(historyCommandLabel({ type: 'document-change', actionType: 'move-stack-item', undo: {}, redo: {} })).toBe('Reorder layers')
    expect(historyCommandLabel({ type: 'document-change', actionType: 'set-canvas-size', undo: {}, redo: {} })).toBe('Resize canvas')
  })
})
