export type ShortcutCommand = { id: string; label: string; category: 'File' | 'Edit' | 'View' | 'Tools'; defaultBinding: string }

export const shortcutCommands: readonly ShortcutCommand[] = [
  { id: 'file.new', label: 'New document', category: 'File', defaultBinding: 'mod+n' },
  { id: 'file.open', label: 'Open', category: 'File', defaultBinding: 'mod+o' },
  { id: 'file.save', label: 'Save project', category: 'File', defaultBinding: 'mod+s' },
  { id: 'edit.undo', label: 'Undo', category: 'Edit', defaultBinding: 'mod+z' },
  { id: 'edit.redo', label: 'Redo', category: 'Edit', defaultBinding: 'mod+shift+z' },
  { id: 'edit.transform-again', label: 'Transform Again', category: 'Edit', defaultBinding: 'mod+shift+t' },
  { id: 'layer.new', label: 'New layer', category: 'Edit', defaultBinding: 'mod+shift+n' },
  { id: 'layer.duplicate', label: 'Duplicate layer', category: 'Edit', defaultBinding: 'mod+j' },
  { id: 'select.inverse', label: 'Invert selection', category: 'Edit', defaultBinding: 'mod+shift+i' },
  { id: 'view.actual', label: 'Actual pixels', category: 'View', defaultBinding: 'mod+0' },
  { id: 'view.zoom-in', label: 'Zoom in', category: 'View', defaultBinding: 'mod+=' },
  { id: 'view.zoom-out', label: 'Zoom out', category: 'View', defaultBinding: 'mod+-' },
  ...([
    ['move', 'Move', 'v'], ['marquee', 'Rectangular Marquee', 'm'], ['ellipse-select', 'Elliptical Marquee', 'shift+m'], ['lasso', 'Lasso', 'l'], ['polygonal-lasso', 'Polygonal Lasso', 'shift+l'], ['magic-wand', 'Magic Wand', 'w'], ['object-select', 'Object Select', 'shift+w'], ['crop', 'Crop', 'c'], ['perspective-crop', 'Perspective Crop', 'shift+c'], ['eyedropper', 'Eyedropper', 'i'], ['measure', 'Measure', 'shift+i'], ['healing', 'Healing Brush', 'j'], ['clone-stamp', 'Clone Stamp', 's'], ['brush', 'Brush', 'b'], ['pencil', 'Pencil', 'shift+b'], ['history-brush', 'History Brush', 'y'], ['eraser', 'Eraser', 'e'], ['fill', 'Paint Bucket', 'g'], ['gradient', 'Gradient', 'shift+g'], ['dodge', 'Dodge', 'o'], ['burn', 'Burn', 'shift+o'], ['text', 'Type', 't'], ['pen', 'Pen', 'p'], ['direct-select', 'Direct Selection', 'a'], ['path-select', 'Path Selection', 'shift+a'], ['rectangle', 'Rectangle', 'u'], ['ellipse', 'Ellipse', 'shift+u'], ['hand', 'Hand', 'h'], ['zoom', 'Zoom', 'z'],
  ] as const).map(([id, label, defaultBinding]) => ({ id: `tool.${id}`, label, category: 'Tools' as const, defaultBinding })),
]

export type ShortcutMap = Record<string, string>
export const defaultShortcuts = Object.fromEntries(shortcutCommands.map((command) => [command.id, command.defaultBinding])) as ShortcutMap

export function normalizeShortcut(binding: string) {
  const parts = binding.toLowerCase().split('+').map((part) => part.trim()).filter(Boolean)
  const key = parts.find((part) => !['mod', 'ctrl', 'meta', 'alt', 'shift'].includes(part))
  if (!key) return ''
  return [...(parts.some((part) => ['mod', 'ctrl', 'meta'].includes(part)) ? ['mod'] : []), ...(parts.includes('alt') ? ['alt'] : []), ...(parts.includes('shift') ? ['shift'] : []), key === 'plus' ? '=' : key].join('+')
}

export function shortcutFromEvent(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>) {
  const rawKey = event.key.toLowerCase()
  if (['meta', 'control', 'alt', 'shift'].includes(rawKey)) return ''
  const key = rawKey === ' ' ? 'space' : rawKey === '+' ? '=' : rawKey
  return normalizeShortcut(`${event.metaKey || event.ctrlKey ? 'mod+' : ''}${event.altKey ? 'alt+' : ''}${event.shiftKey ? 'shift+' : ''}${key}`)
}

export function shortcutLabel(binding: string) {
  if (!binding) return 'Unassigned'
  const mac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform)
  return binding.split('+').map((part) => part === 'mod' ? mac ? '⌘' : 'Ctrl' : part === 'alt' ? mac ? '⌥' : 'Alt' : part === 'shift' ? '⇧' : part === 'space' ? 'Space' : part.length === 1 ? part.toUpperCase() : part).join(mac ? '' : '+')
}

export function normalizeShortcutMap(value: unknown): ShortcutMap {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return Object.fromEntries(shortcutCommands.map((command) => {
    const binding = source[command.id]
    return [command.id, typeof binding === 'string' ? normalizeShortcut(binding) : command.defaultBinding]
  }))
}

export function commandForEvent(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>, shortcuts: ShortcutMap, category?: ShortcutCommand['category']) {
  const binding = shortcutFromEvent(event)
  return shortcutCommands.find((command) => (!category || command.category === category) && shortcuts[command.id] === binding)?.id ?? null
}
