import { describe, expect, it } from 'vitest'
import { shortcutCommands } from './shortcuts'
import { missingPhotopeaCapabilities, studioAdjustmentParity, studioFilterParity, studioPanelParity, studioToolParity } from './photopea-parity'

describe('Photopea parity registry', () => {
  it('classifies every current tool and every tool shortcut target', () => {
    expect(Object.keys(studioToolParity)).toHaveLength(41)
    const shortcutTools = shortcutCommands.filter((command) => command.id.startsWith('tool.')).map((command) => command.id.slice(5))
    expect(shortcutTools.every((tool) => tool in studioToolParity)).toBe(true)
  })

  it('keeps every assessment actionable', () => {
    const assessments = [
      ...Object.values(studioToolParity),
      ...Object.values(studioAdjustmentParity),
      ...Object.values(studioFilterParity),
      ...Object.values(studioPanelParity),
      ...missingPhotopeaCapabilities.map((capability) => capability.assessment),
    ]
    expect(assessments.length).toBeGreaterThan(80)
    expect(assessments.every((assessment) => assessment.gap.trim().length >= 12)).toBe(true)
  })

  it('uses stable unique identifiers for missing capabilities', () => {
    const ids = missingPhotopeaCapabilities.map((capability) => capability.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
