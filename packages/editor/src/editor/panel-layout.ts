export const minimumPanelWidth = 220
export const maximumPanelWidth = 480

export function clampPanelWidth(width: number) {
  return Math.round(Math.max(minimumPanelWidth, Math.min(maximumPanelWidth, width)))
}
