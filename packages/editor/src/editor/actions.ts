export type ActionCommand = 'new-layer' | 'duplicate-layer' | 'invert' | 'grayscale' | 'blur' | 'sharpen' | 'rotate-cw' | 'flip-x' | 'select-all' | 'deselect'
export type ActionCondition = 'always' | 'has-selection' | 'raster-layer' | 'multiple-layers'
export type ActionStep = { id: string; command: ActionCommand; enabled: boolean; condition: ActionCondition }
export type ActionPreset = { id: string; name: string; steps: ActionStep[] }

export const actionCommandLabels: Record<ActionCommand, string> = {
  'new-layer': 'New layer', 'duplicate-layer': 'Duplicate layer', invert: 'Invert pixels', grayscale: 'Grayscale', blur: 'Blur', sharpen: 'Sharpen', 'rotate-cw': 'Rotate canvas clockwise', 'flip-x': 'Flip canvas horizontally', 'select-all': 'Select all', deselect: 'Deselect',
}

export function normalizeActions(value: unknown): ActionPreset[] {
  if (!Array.isArray(value)) return []
  const commands = new Set(Object.keys(actionCommandLabels) as ActionCommand[])
  const conditions = new Set<ActionCondition>(['always', 'has-selection', 'raster-layer', 'multiple-layers'])
  return value.flatMap((entry): ActionPreset[] => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Partial<ActionPreset>
    const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 48) : ''
    if (!name || !Array.isArray(candidate.steps)) return []
    const steps = candidate.steps.flatMap((step): ActionStep[] => {
      if (!step || typeof step !== 'object') return []
      const value = step as Partial<ActionStep>
      if (!commands.has(value.command as ActionCommand)) return []
      return [{ id: typeof value.id === 'string' ? value.id : crypto.randomUUID(), command: value.command as ActionCommand, enabled: value.enabled !== false, condition: conditions.has(value.condition as ActionCondition) ? value.condition as ActionCondition : 'always' }]
    }).slice(0, 100)
    return steps.length ? [{ id: typeof candidate.id === 'string' ? candidate.id : crypto.randomUUID(), name, steps }] : []
  }).slice(0, 64)
}

export function actionConditionMatches(condition: ActionCondition, context: { hasSelection: boolean; rasterLayer: boolean; selectedLayers: number }) {
  return condition === 'always' || condition === 'has-selection' && context.hasSelection || condition === 'raster-layer' && context.rasterLayer || condition === 'multiple-layers' && context.selectedLayers > 1
}

export function applyBatchPixelActions(data: Uint8ClampedArray, commands: ActionCommand[]) {
  const output = new Uint8ClampedArray(data)
  for (const command of commands) for (let offset = 0; offset < output.length; offset += 4) {
    if (command === 'invert') for (let channel = 0; channel < 3; channel += 1) output[offset + channel] = 255 - output[offset + channel]
    else if (command === 'grayscale') {
      const luminance = Math.round(output[offset] * 0.2126 + output[offset + 1] * 0.7152 + output[offset + 2] * 0.0722)
      output[offset] = luminance; output[offset + 1] = luminance; output[offset + 2] = luminance
    } else if (command === 'sharpen') for (let channel = 0; channel < 3; channel += 1) output[offset + channel] = Math.max(0, Math.min(255, (output[offset + channel] - 128) * 1.15 + 128))
  }
  return output
}
