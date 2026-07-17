import { describe, expect, it } from 'vitest'
import { commandForEvent, defaultShortcuts, normalizeShortcutMap, shortcutFromEvent } from './shortcuts'

describe('editable shortcuts', () => {
  it('normalizes platform command keys to mod bindings', () => {
    expect(shortcutFromEvent({ key: 'S', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true })).toBe('mod+shift+s')
  })

  it('resolves customized commands and fills missing defaults', () => {
    const shortcuts = normalizeShortcutMap({ 'tool.brush': 'k' })
    expect(commandForEvent({ key: 'k', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }, shortcuts, 'Tools')).toBe('tool.brush')
    expect(shortcuts['file.save']).toBe(defaultShortcuts['file.save'])
  })

  it('does not trigger unassigned commands from modifier-only events', () => {
    expect(commandForEvent({ key: 'Shift', metaKey: false, ctrlKey: false, altKey: false, shiftKey: true }, { ...defaultShortcuts, 'tool.move': '' })).toBeNull()
  })
})
