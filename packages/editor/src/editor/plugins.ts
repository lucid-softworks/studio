import type { EditorTool } from '../components/ToolRail'

export type PluginImporterHook = { id: string; label: string; extensions: string[] }
export type PluginExporterHook = { id: string; label: string; format: 'png' | 'jpeg' | 'webp' }
export type PluginFilterHook = { id: string; label: string; matrix: number[] }
export type PluginPanelHook = { id: string; label: string; description: string }
export type PluginToolHook = { id: string; label: string; target: EditorTool; mark: string }
export type StudioPlugin = {
  app: 'studio-plugin'
  version: 1
  id: string
  name: string
  hooks: { importers: PluginImporterHook[]; exporters: PluginExporterHook[]; filters: PluginFilterHook[]; panels: PluginPanelHook[]; tools: PluginToolHook[] }
}

const editorTools = new Set<EditorTool>(['move', 'marquee', 'ellipse-select', 'lasso', 'polygonal-lasso', 'magic-wand', 'object-select', 'crop', 'perspective-crop', 'eyedropper', 'measure', 'healing', 'clone-stamp', 'brush', 'pencil', 'color-replacement', 'mixer-brush', 'history-brush', 'eraser', 'fill', 'gradient', 'dodge', 'burn', 'pattern-stamp', 'sponge', 'blur', 'sharpen', 'smudge', 'text', 'pen', 'direct-select', 'path-select', 'warp', 'puppet-warp', 'rectangle', 'ellipse', 'hand', 'zoom'])
const safeId = (value: unknown) => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value) ? value : null
const safeLabel = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 48) : null

export function normalizePlugins(value: unknown): StudioPlugin[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): StudioPlugin[] => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Partial<StudioPlugin>
    const id = safeId(candidate.id)
    const name = safeLabel(candidate.name)
    if (candidate.app !== 'studio-plugin' || candidate.version !== 1 || !id || !name) return []
    const source: Partial<StudioPlugin['hooks']> = candidate.hooks && typeof candidate.hooks === 'object' ? candidate.hooks : {}
    const importers = (Array.isArray(source.importers) ? source.importers : []).flatMap((hook): PluginImporterHook[] => {
      const hookId = safeId(hook?.id); const label = safeLabel(hook?.label)
      const extensions = Array.isArray(hook?.extensions) ? hook.extensions.flatMap((extension) => {
        if (typeof extension !== 'string') return []
        const normalized = extension.toLowerCase().replace(/^\./, '')
        return /^[a-z0-9]{1,12}$/.test(normalized) ? [normalized] : []
      }).slice(0, 16) : []
      return hookId && label && extensions.length ? [{ id: hookId, label, extensions }] : []
    })
    const exporters = (Array.isArray(source.exporters) ? source.exporters : []).flatMap((hook): PluginExporterHook[] => {
      const hookId = safeId(hook?.id); const label = safeLabel(hook?.label)
      return hookId && label && ['png', 'jpeg', 'webp'].includes(hook?.format) ? [{ id: hookId, label, format: hook.format as PluginExporterHook['format'] }] : []
    })
    const filters = (Array.isArray(source.filters) ? source.filters : []).flatMap((hook): PluginFilterHook[] => {
      const hookId = safeId(hook?.id); const label = safeLabel(hook?.label)
      const matrix = Array.isArray(hook?.matrix) && hook.matrix.length === 20 && hook.matrix.every((value) => typeof value === 'number' && Number.isFinite(value)) ? hook.matrix.map(Number) : null
      return hookId && label && matrix ? [{ id: hookId, label, matrix }] : []
    })
    const panels = (Array.isArray(source.panels) ? source.panels : []).flatMap((hook): PluginPanelHook[] => {
      const hookId = safeId(hook?.id); const label = safeLabel(hook?.label); const description = typeof hook?.description === 'string' ? hook.description.slice(0, 2000) : ''
      return hookId && label ? [{ id: hookId, label, description }] : []
    })
    const tools = (Array.isArray(source.tools) ? source.tools : []).flatMap((hook): PluginToolHook[] => {
      const hookId = safeId(hook?.id); const label = safeLabel(hook?.label)
      return hookId && label && editorTools.has(hook?.target as EditorTool) ? [{ id: hookId, label, target: hook.target as EditorTool, mark: typeof hook.mark === 'string' ? hook.mark.slice(0, 2) : 'P' }] : []
    })
    return [{ app: 'studio-plugin', version: 1, id, name, hooks: { importers, exporters, filters, panels, tools } }]
  }).slice(0, 32)
}

export async function parsePluginFile(file: File) {
  if (file.size > 1_000_000) throw new Error('Plugin manifests are limited to 1 MB.')
  let value: unknown
  try { value = JSON.parse(await file.text()) } catch { throw new Error('That plugin manifest is not valid JSON.') }
  const plugins = normalizePlugins([value])
  if (!plugins.length) throw new Error('That is not a valid Studio plugin manifest.')
  return plugins[0]
}

export function applyColorMatrix(data: Uint8ClampedArray, matrix: number[]) {
  const output = new Uint8ClampedArray(data)
  for (let offset = 0; offset < output.length; offset += 4) {
    const source = [output[offset], output[offset + 1], output[offset + 2], output[offset + 3]]
    for (let row = 0; row < 4; row += 1) output[offset + row] = Math.max(0, Math.min(255, source[0] * matrix[row * 5] + source[1] * matrix[row * 5 + 1] + source[2] * matrix[row * 5 + 2] + source[3] * matrix[row * 5 + 3] + matrix[row * 5 + 4] * 255))
  }
  return output
}
