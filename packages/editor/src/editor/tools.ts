export const editorToolIds = [
  'move',
  'marquee',
  'ellipse-select',
  'single-row-select',
  'single-column-select',
  'lasso',
  'polygonal-lasso',
  'magnetic-lasso',
  'magic-wand',
  'object-select',
  'crop',
  'perspective-crop',
  'eyedropper',
  'measure',
  'count',
  'note',
  'healing',
  'clone-stamp',
  'brush',
  'pencil',
  'color-replacement',
  'mixer-brush',
  'history-brush',
  'eraser',
  'fill',
  'gradient',
  'dodge',
  'burn',
  'pattern-stamp',
  'sponge',
  'blur',
  'sharpen',
  'smudge',
  'text',
  'pen',
  'direct-select',
  'path-select',
  'warp',
  'puppet-warp',
  'rectangle',
  'ellipse',
  'hand',
  'zoom',
] as const

export type EditorTool = typeof editorToolIds[number]

const editorTools = new Set<string>(editorToolIds)

export function isEditorTool(value: unknown): value is EditorTool {
  return typeof value === 'string' && editorTools.has(value)
}
