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

export type UtilityPanelId = 'layers' | 'history' | 'navigator' | 'info'

export type WorkspaceLayout = {
  propertiesOnLeft: boolean
  panelWidths: PanelWidths
  collapsedPanels: CollapsedPanels
  activeUtilityPanel: UtilityPanelId
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
    },
  },
]

export function clampPanelWidth(width: number) {
  return Math.round(Math.max(minimumPanelWidth, Math.min(maximumPanelWidth, width)))
}

export function normalizeWorkspaceLayout(value: unknown, fallback = defaultWorkspaceLayout): WorkspaceLayout {
  if (!value || typeof value !== 'object') return structuredClone(fallback)
  const candidate = value as Partial<WorkspaceLayout>
  const widths = candidate.panelWidths
  const collapsed = candidate.collapsedPanels
  const utilityPanels: UtilityPanelId[] = ['layers', 'history', 'navigator', 'info']
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
  }
}
