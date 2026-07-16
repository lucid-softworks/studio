import { describe, expect, it } from 'vitest'
import { shortcutCommands } from './shortcuts'
import {
  completeParityInventory,
  missingPhotopeaCapabilities,
  studioAdjustmentParity,
  studioFilterParity,
  studioFormatOperationParity,
  studioLayerTypeParity,
  studioMenuCommandParity,
  studioPanelParity,
  studioPresetOperationParity,
  studioShortcutParity,
  studioToolParity,
} from './photopea-parity'

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
    expect(assessments.every((assessment) => assessment.concerns.length > 0)).toBe(true)
    const concerns = new Set(assessments.flatMap((assessment) => assessment.concerns))
    expect(concerns).toEqual(new Set(['missing', 'partial', 'visually-inaccurate', 'round-trip-incompatible', 'too-slow', 'parity-validated']))
  })

  it('uses stable unique identifiers for missing capabilities', () => {
    const ids = missingPhotopeaCapabilities.map((capability) => capability.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('tracks every individual parity inventory item with stable identifiers', () => {
    expect(studioMenuCommandParity.length).toBeGreaterThanOrEqual(65)
    expect(studioLayerTypeParity.length).toBeGreaterThanOrEqual(25)
    expect(studioFormatOperationParity.length).toBeGreaterThanOrEqual(40)
    expect(studioPresetOperationParity.length).toBeGreaterThanOrEqual(14)
    expect(studioShortcutParity.length).toBeGreaterThanOrEqual(shortcutCommands.length + 10)

    const ids = completeParityInventory.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(completeParityInventory.every((entry) => entry.studio.trim() && entry.photopea.trim())).toBe(true)
    expect(completeParityInventory.every((entry) => entry.assessment.gap.trim().length >= 12)).toBe(true)
  })

  it('requires concrete automated evidence for every parity-validated claim', () => {
    const assessments = [
      ...Object.values(studioToolParity),
      ...Object.values(studioAdjustmentParity),
      ...Object.values(studioFilterParity),
      ...Object.values(studioPanelParity),
      ...missingPhotopeaCapabilities.map((capability) => capability.assessment),
      ...completeParityInventory.map((entry) => entry.assessment),
    ]
    const validated = assessments.filter((assessment) => assessment.status === 'parity-validated')
    expect(validated.length).toBeGreaterThanOrEqual(11)
    expect(validated.every((assessment) => assessment.evidence.length > 0)).toBe(true)
    expect(validated.flatMap((assessment) => assessment.evidence).every((path) => /\.(spec|test)\.tsx?$/.test(path))).toBe(true)
  })

  it('includes every registered shortcut and every built-in tool in the shortcut matrix', () => {
    const shortcutIds = new Set(studioShortcutParity.map((entry) => entry.id))
    for (const command of shortcutCommands) expect(shortcutIds.has(`shortcut.${command.id}`)).toBe(true)
    for (const tool of Object.keys(studioToolParity)) expect(shortcutIds.has(`shortcut.tool.${tool}`)).toBe(true)
  })
})
