import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { psdCompatibility } from './psd-compatibility'

const repositoryRoot = resolve(import.meta.dirname, '../../../..')

describe('PSD compatibility registry', () => {
  it('uses stable unique IDs and actionable support claims', () => {
    expect(psdCompatibility.length).toBeGreaterThanOrEqual(18)
    expect(new Set(psdCompatibility.map((entry) => entry.id)).size).toBe(psdCompatibility.length)
    expect(psdCompatibility.every((entry) => entry.capability.trim().length > 3)).toBe(true)
    expect(psdCompatibility.every((entry) => entry.detail.trim().length > 24)).toBe(true)
  })

  it('backs every claim with repository tests that exist', () => {
    expect(psdCompatibility.every((entry) => entry.evidence.length > 0)).toBe(true)
    for (const evidence of psdCompatibility.flatMap((entry) => entry.evidence)) {
      expect(evidence).toMatch(/\.(spec|test)\.tsx?$/)
      expect(existsSync(resolve(repositoryRoot, evidence)), evidence).toBe(true)
    }
  })

  it('publishes every typed claim in the compatibility table', () => {
    const table = readFileSync(resolve(repositoryRoot, 'docs/PSD_COMPATIBILITY.md'), 'utf8')
    for (const entry of psdCompatibility) expect(table).toContain(`| \`${entry.id}\` |`)
  })
})
