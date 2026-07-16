import { beforeEach, describe, expect, it } from 'vitest'
import { createDiagnosticReport, documentDiagnosticSummary, recordDiagnosticEvent, resetDiagnosticEventsForTest } from './diagnostics'
import { initialDocument } from './presets'

describe('diagnostics', () => {
  beforeEach(resetDiagnosticEventsForTest)

  it('summarizes a document without exposing names or pixels', () => {
    const summary = documentDiagnosticSummary({ ...structuredClone(initialDocument), layers: [{ ...structuredClone(initialDocument.layers[0]), name: 'private-name.png' }] })
    expect(summary?.layers).toBe(1)
    expect(JSON.stringify(summary)).not.toContain('private-name')
  })

  it('bounds and sanitizes recorded errors', () => {
    for (let index = 0; index < 25; index += 1) recordDiagnosticEvent('error', new Error(`failure ${index}\nsecret`))
    const report = createDiagnosticReport()
    expect(report.recentEvents).toHaveLength(20)
    expect(report.recentEvents.at(-1)?.message).toBe('failure 24 secret')
  })
})
