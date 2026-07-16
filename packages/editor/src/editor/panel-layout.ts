export const minimumPanelWidth = 220
export const maximumPanelWidth = 480

export type PanelWidths = {
  properties: number
  layers: number
}

export type CollapsedPanels = {
  properties: boolean
  layers: boolean
}

export type UtilityPanelId = 'layers' | 'channels' | 'paths' | 'history' | 'navigator' | 'histogram' | 'swatches' | 'gradients' | 'patterns' | 'libraries' | 'info'
export type FloatingPanelPosition = { x: number; y: number }

export type WorkspaceLayout = {
  propertiesOnLeft: boolean
  panelWidths: PanelWidths
  collapsedPanels: CollapsedPanels
  activeUtilityPanel: UtilityPanelId
  utilityPanelOrder: UtilityPanelId[]
  utilityPanelFloating: boolean
  floatingPanelPosition: FloatingPanelPosition
  secondaryUtilityPanel: UtilityPanelId | null
  secondaryPanelHeight: number
  secondaryUtilityPanelFloating: boolean
  secondaryFloatingPanelPosition: FloatingPanelPosition
}

export type WorkspacePreset = {
  name: string
  layout: WorkspaceLayout
  builtIn?: boolean
}

export const defaultWorkspaceLayout: WorkspaceLayout = {
  propertiesOnLeft: true,
  panelWidths: { properties: 310, layers: 258 },
  collapsedPanels: { properties: false, layers: false },
  activeUtilityPanel: 'layers',
  utilityPanelOrder: ['layers', 'channels', 'paths', 'history', 'navigator', 'histogram', 'swatches', 'gradients', 'patterns', 'libraries', 'info'],
  utilityPanelFloating: false,
  floatingPanelPosition: { x: 960, y: 84 },
  secondaryUtilityPanel: null,
  secondaryPanelHeight: 280,
  secondaryUtilityPanelFloating: false,
  secondaryFloatingPanelPosition: { x: 640, y: 180 },
}

export const builtInWorkspacePresets: readonly WorkspacePreset[] = [
  { name: 'Essentials', builtIn: true, layout: defaultWorkspaceLayout },
  {
    name: 'Canvas focus',
    builtIn: true,
    layout: {
      propertiesOnLeft: true,
      panelWidths: { properties: 310, layers: 258 },
      collapsedPanels: { properties: true, layers: true },
      activeUtilityPanel: 'navigator',
      utilityPanelOrder: ['navigator', 'histogram', 'swatches', 'gradients', 'patterns', 'libraries', 'layers', 'channels', 'paths', 'history', 'info'],
      utilityPanelFloating: false,
      floatingPanelPosition: { x: 960, y: 84 },
      secondaryUtilityPanel: null,
      secondaryPanelHeight: 280,
      secondaryUtilityPanelFloating: false,
      secondaryFloatingPanelPosition: { x: 640, y: 180 },
    },
  },
  {
    name: 'Layer work',
    builtIn: true,
    layout: {
      propertiesOnLeft: true,
      panelWidths: { properties: 280, layers: 360 },
      collapsedPanels: { properties: true, layers: false },
      activeUtilityPanel: 'layers',
      utilityPanelOrder: ['layers', 'channels', 'paths', 'history', 'navigator', 'histogram', 'swatches', 'gradients', 'patterns', 'libraries', 'info'],
      utilityPanelFloating: false,
      floatingPanelPosition: { x: 960, y: 84 },
      secondaryUtilityPanel: 'history',
      secondaryPanelHeight: 260,
      secondaryUtilityPanelFloating: false,
      secondaryFloatingPanelPosition: { x: 640, y: 180 },
    },
  },
]

export function clampPanelWidth(width: number) {
  return Math.round(Math.max(minimumPanelWidth, Math.min(maximumPanelWidth, width)))
}

export function reorderUtilityPanels(order: UtilityPanelId[], moved: UtilityPanelId, before: UtilityPanelId) {
  const next = order.filter((panel) => panel !== moved)
  const targetIndex = next.indexOf(before)
  next.splice(targetIndex < 0 ? next.length : targetIndex, 0, moved)
  return next
}

export function clampFloatingPanelPosition(position: FloatingPanelPosition, panelWidth: number, viewport: { width: number; height: number }) {
  const visibleWidth = Math.min(48, panelWidth)
  return {
    x: Math.round(Math.max(0, Math.min(viewport.width - visibleWidth, position.x))),
    y: Math.round(Math.max(48, Math.min(viewport.height - 48, position.y))),
  }
}

export function normalizeWorkspaceLayout(value: unknown, fallback = defaultWorkspaceLayout): WorkspaceLayout {
  if (!value || typeof value !== 'object') return structuredClone(fallback)
  const candidate = value as Partial<WorkspaceLayout>
  const widths = candidate.panelWidths
  const collapsed = candidate.collapsedPanels
  const utilityPanels: UtilityPanelId[] = ['layers', 'channels', 'paths', 'history', 'navigator', 'histogram', 'swatches', 'gradients', 'patterns', 'libraries', 'info']
  const requestedOrder = Array.isArray(candidate.utilityPanelOrder) ? candidate.utilityPanelOrder.filter((panel): panel is UtilityPanelId => utilityPanels.includes(panel as UtilityPanelId)) : []
  const utilityPanelOrder = [...new Set([...requestedOrder, ...utilityPanels])]
  const floatingPosition = candidate.floatingPanelPosition
  const secondaryFloatingPosition = candidate.secondaryFloatingPanelPosition
  return {
    propertiesOnLeft: typeof candidate.propertiesOnLeft === 'boolean' ? candidate.propertiesOnLeft : fallback.propertiesOnLeft,
    panelWidths: {
      properties: clampPanelWidth(typeof widths?.properties === 'number' && Number.isFinite(widths.properties) ? widths.properties : fallback.panelWidths.properties),
      layers: clampPanelWidth(typeof widths?.layers === 'number' && Number.isFinite(widths.layers) ? widths.layers : fallback.panelWidths.layers),
    },
    collapsedPanels: {
      properties: typeof collapsed?.properties === 'boolean' ? collapsed.properties : fallback.collapsedPanels.properties,
      layers: typeof collapsed?.layers === 'boolean' ? collapsed.layers : fallback.collapsedPanels.layers,
    },
    activeUtilityPanel: utilityPanels.includes(candidate.activeUtilityPanel as UtilityPanelId) ? candidate.activeUtilityPanel as UtilityPanelId : fallback.activeUtilityPanel,
    utilityPanelOrder,
    utilityPanelFloating: typeof candidate.utilityPanelFloating === 'boolean' ? candidate.utilityPanelFloating : fallback.utilityPanelFloating,
    floatingPanelPosition: {
      x: typeof floatingPosition?.x === 'number' && Number.isFinite(floatingPosition.x) ? floatingPosition.x : fallback.floatingPanelPosition.x,
      y: typeof floatingPosition?.y === 'number' && Number.isFinite(floatingPosition.y) ? floatingPosition.y : fallback.floatingPanelPosition.y,
    },
    secondaryUtilityPanel: utilityPanels.includes(candidate.secondaryUtilityPanel as UtilityPanelId) ? candidate.secondaryUtilityPanel as UtilityPanelId : fallback.secondaryUtilityPanel,
    secondaryPanelHeight: Math.round(Math.max(160, Math.min(600, typeof candidate.secondaryPanelHeight === 'number' && Number.isFinite(candidate.secondaryPanelHeight) ? candidate.secondaryPanelHeight : fallback.secondaryPanelHeight))),
    secondaryUtilityPanelFloating: typeof candidate.secondaryUtilityPanelFloating === 'boolean' ? candidate.secondaryUtilityPanelFloating : fallback.secondaryUtilityPanelFloating,
    secondaryFloatingPanelPosition: {
      x: typeof secondaryFloatingPosition?.x === 'number' && Number.isFinite(secondaryFloatingPosition.x) ? secondaryFloatingPosition.x : fallback.secondaryFloatingPanelPosition.x,
      y: typeof secondaryFloatingPosition?.y === 'number' && Number.isFinite(secondaryFloatingPosition.y) ? secondaryFloatingPosition.y : fallback.secondaryFloatingPanelPosition.y,
    },
  }
}
