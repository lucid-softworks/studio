import type { DocumentCounts, DocumentCountMarker } from './types'

const csvCell = (value: string | number) => {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function countMarkerNumber(markers: readonly DocumentCountMarker[], marker: DocumentCountMarker) {
  return markers.filter((candidate) => candidate.groupId === marker.groupId).findIndex((candidate) => candidate.id === marker.id) + 1
}

export function countsCsv(counts: DocumentCounts) {
  const groups = new Map(counts.groups.map((group) => [group.id, group]))
  const rows = counts.markers.map((marker) => {
    const group = groups.get(marker.groupId)
    return [group?.name ?? 'Unknown group', countMarkerNumber(counts.markers, marker), marker.label, marker.x, marker.y]
      .map(csvCell)
      .join(',')
  })
  return ['Group,Number,Label,X,Y', ...rows].join('\n')
}
