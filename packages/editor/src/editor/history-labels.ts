import type { DocumentHistoryCommand } from './types'

const actionLabels: Record<DocumentHistoryCommand['actionType'], string> = {
  'set-canvas-preset': 'Change canvas preset',
  'set-canvas-size': 'Resize canvas',
  'set-background': 'Change background',
  'set-pattern': 'Change pattern',
  'set-channels': 'Edit channels',
  'set-paths': 'Edit paths',
  'set-guides': 'Edit guides',
  'set-grid': 'Change grid',
  'set-artboards': 'Edit artboards',
  'replace-document': 'Replace document',
  'add-layer': 'Add layer',
  'replace-layer': 'Rasterize layer',
  'add-group': 'Add layer group',
  'update-layer': 'Edit layer',
  'update-layers': 'Edit layers',
  'update-group': 'Edit layer group',
  'remove-layer': 'Delete layer',
  'remove-layers': 'Delete layers',
  'remove-group': 'Delete layer group',
  'select-layer': 'Select layer',
  'select-group': 'Select layer group',
  'move-layer': 'Move layer',
  'move-group': 'Move layer group',
  'move-stack-item': 'Reorder layers',
  'reset-document': 'Reset document',
}

export function historyCommandLabel(command: DocumentHistoryCommand) {
  return actionLabels[command.actionType]
}
