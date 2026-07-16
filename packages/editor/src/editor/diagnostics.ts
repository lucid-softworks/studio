import type { EditorDocument } from './types'

export type DiagnosticEvent = {
  at: string
  kind: 'error' | 'unhandled-rejection' | 'render-error'
  message: string
  stack?: string
}

const recentEvents: DiagnosticEvent[] = []
let listenersInstalled = false

function cleanText(value: unknown, fallback: string) {
  const text = value instanceof Error ? value.message : typeof value === 'string' ? value : fallback
  return text.replace(/[\r\n]+/g, ' ').slice(0, 500)
}

function cleanStack(value: unknown) {
  if (!(value instanceof Error) || !value.stack) return undefined
  return value.stack.replace(/[?#][^\s):]+/g, '').slice(0, 4_000)
}

export function recordDiagnosticEvent(kind: DiagnosticEvent['kind'], value: unknown) {
  recentEvents.push({
    at: new Date().toISOString(),
    kind,
    message: cleanText(value, kind === 'unhandled-rejection' ? 'Unhandled promise rejection' : 'Unknown editor error'),
    stack: cleanStack(value),
  })
  if (recentEvents.length > 20) recentEvents.splice(0, recentEvents.length - 20)
}

export function installDiagnosticListeners() {
  if (listenersInstalled || typeof window === 'undefined') return
  listenersInstalled = true
  window.addEventListener('error', (event) => recordDiagnosticEvent('error', event.error ?? event.message))
  window.addEventListener('unhandledrejection', (event) => recordDiagnosticEvent('unhandled-rejection', event.reason))
}

export function documentDiagnosticSummary(document: EditorDocument | null) {
  if (!document) return null
  const layerTypes = document.layers.reduce<Record<string, number>>((counts, layer) => {
    counts[layer.type] = (counts[layer.type] ?? 0) + 1
    return counts
  }, {})
  return {
    schemaVersion: document.schemaVersion,
    canvas: { ...document.canvasSize },
    bitDepth: document.bitDepth,
    colorMode: document.colorMode ?? 'rgb',
    layers: document.layers.length,
    groups: document.groups.length,
    layerTypes,
    artboards: document.artboards?.length ?? 0,
    channels: document.channels?.length ?? 0,
    paths: document.paths?.length ?? 0,
    selectedLayers: document.selectedLayerIds.length,
  }
}

type DiagnosticOptions = {
  document?: EditorDocument | null
  renderer?: string
  rendererState?: string
  assetCount?: number
  pluginCount?: number
  recovery?: { state: string; savedAt?: string }
}

export function createDiagnosticReport(options: DiagnosticOptions = {}) {
  const nav = typeof navigator === 'undefined' ? null : navigator
  return {
    reportVersion: 1,
    createdAt: new Date().toISOString(),
    privacy: 'Document pixels, layer names, filenames, local file paths, plugin manifests, and saved resources are excluded.',
    runtime: {
      userAgent: nav?.userAgent ?? 'unavailable',
      language: nav?.language ?? 'unavailable',
      platform: nav?.platform ?? 'unavailable',
      online: nav?.onLine ?? false,
      hardwareConcurrency: nav?.hardwareConcurrency ?? 0,
      deviceMemory: 'deviceMemory' in (nav ?? {}) ? (nav as Navigator & { deviceMemory?: number }).deviceMemory ?? null : null,
      crossOriginIsolated: typeof crossOriginIsolated === 'boolean' ? crossOriginIsolated : false,
      webgpu: Boolean(nav && 'gpu' in nav),
      offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
      indexedDb: typeof indexedDB !== 'undefined',
    },
    editor: {
      renderer: options.renderer ?? 'unknown',
      rendererState: options.rendererState ?? 'unknown',
      assets: options.assetCount ?? 0,
      plugins: options.pluginCount ?? 0,
      recovery: options.recovery ?? { state: 'unknown' },
      document: documentDiagnosticSummary(options.document ?? null),
    },
    recentEvents: recentEvents.map((event) => ({ ...event })),
  }
}

export function resetDiagnosticEventsForTest() {
  recentEvents.length = 0
}
