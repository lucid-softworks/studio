import { describe, expect, it } from 'vitest'
import { initialDocument } from './presets'
import { estimateProjectAssetBytes, migrateDocument, parseProjectFile, serializeProject, STUDIO_PROJECT_VERSION, writeProjectStream } from './project'
import type { AssetMap } from './runtime-assets'
import type { BrowserWritable } from './file-save'

class MemoryWritable implements BrowserWritable {
  chunks: string[] = []
  closed = false

  async write(data: Blob | BufferSource | string) {
    if (typeof data === 'string') this.chunks.push(data)
    else if (data instanceof Blob) this.chunks.push(await data.text())
    else this.chunks.push(new TextDecoder().decode(data as ArrayBufferView))
  }

  async close() { this.closed = true }
}

function legacyDocument() {
  const document = structuredClone(initialDocument) as unknown as Record<string, unknown>
  delete document.schemaVersion
  delete document.groups
  delete document.selectedLayerIds
  delete document.selectedGroupId
  return document
}

describe('Studio project migrations', () => {
  it('migrates version 1 documents to the current schema', () => {
    const document = legacyDocument()
    document.layers = [{
      id: 'heading',
      type: 'text',
      name: 'Heading',
      visible: true,
      locked: false,
      opacity: 100,
      position: { x: 0, y: 0 },
      rotation: 0,
      text: 'Hello',
      color: '#fff',
      fontSize: 72,
      fontWeight: 700,
      textAlign: 'center',
      letterSpacing: 0,
    }]
    document.selectedLayerId = 'heading'

    const migrated = migrateDocument(document, 1)

    expect(migrated.schemaVersion).toBe(3)
    expect(migrated.bitDepth).toBe(8)
    expect(migrated.groups).toEqual([])
    expect(migrated.selectedLayerIds).toEqual(['heading'])
    expect(migrated.selectedGroupId).toBeNull()
    expect(migrated.layers[0]).toMatchObject({ id: 'heading', fontFamily: 'Inter', stackOrder: 0 })
  })

  it('repairs invalid selections and orphaned group references', () => {
    const document = legacyDocument()
    document.layers = [{
      id: 'pixels',
      type: 'raster',
      name: 'Pixels',
      visible: true,
      locked: false,
      opacity: 100,
      position: { x: 0, y: 0 },
      rotation: 0,
      assetId: 'asset',
      width: 100,
      height: 100,
      scale: 100,
      groupId: 'missing-group',
    }]
    document.selectedLayerId = 'missing-layer'

    const migrated = migrateDocument(document, 1)

    expect(migrated.selectedLayerId).toBeNull()
    expect(migrated.selectedLayerIds).toEqual([])
    expect(migrated.layers[0].groupId).toBeNull()
  })

  it('opens legacy project envelopes instead of rejecting them', async () => {
    const file = new File([JSON.stringify({
      app: 'studio',
      version: 1,
      savedAt: '2025-01-01T00:00:00.000Z',
      document: legacyDocument(),
      assets: [],
    })], 'legacy.studio', { type: 'application/x-studio+json' })

    const loaded = await parseProjectFile(file)

    expect(loaded.document.schemaVersion).toBe(3)
    expect(loaded.savedAt).toBe('2025-01-01T00:00:00.000Z')
    expect(loaded.assets).toEqual({})
  })

  it('writes the current envelope and document schema versions', async () => {
    const serialized = JSON.parse(await serializeProject(initialDocument, {})) as {
      version: number
      document: { schemaVersion: number }
    }

    expect(serialized.version).toBe(STUDIO_PROJECT_VERSION)
    expect(serialized.document.schemaVersion).toBe(initialDocument.schemaVersion)
  })

  it('serializes high-precision raster samples with the local project', async () => {
    const assetId = 'precision-raster'
    const document = {
      ...initialDocument,
      bitDepth: 16 as const,
      layers: [{
        id: 'pixels', type: 'raster' as const, name: 'Pixels', visible: true, locked: false, opacity: 100,
        position: { x: 0, y: 0 }, rotation: 0, assetId, width: 1, height: 1, scale: 100, stackOrder: 0,
      }],
    }
    const assets: AssetMap = {
      [assetId]: {
        element: {} as HTMLImageElement,
        name: 'Pixels',
        blob: new Blob([Uint8Array.from([1])], { type: 'image/png' }),
        contentBounds: null,
        precision: { bitDepth: 16, width: 1, height: 1, data: Uint16Array.from([1, 32768, 65535, 65535]), revision: 0 },
      },
    }
    const serialized = JSON.parse(await serializeProject(document, assets)) as { assets: Array<Record<string, unknown>> }

    expect(serialized.assets[0]).toMatchObject({ contentBounds: null, bitDepth: 16, precisionWidth: 1, precisionHeight: 1, precisionRevision: 0 })
    expect(String(serialized.assets[0].precision)).toMatch(/^data:/)
  })

  it('serializes assets referenced by nested smart-object documents', async () => {
    const nested = {
      ...structuredClone(initialDocument),
      layers: [{ id: 'inside', type: 'raster' as const, name: 'Inside', visible: true, locked: false, opacity: 100, position: { x: 0, y: 0 }, rotation: 0, assetId: 'inside-asset', width: 1, height: 1, scale: 100 }],
    }
    const document = {
      ...structuredClone(initialDocument),
      layers: [{ id: 'smart', type: 'smart-object' as const, name: 'Smart', visible: true, locked: false, opacity: 100, position: { x: 0, y: 0 }, rotation: 0, assetId: 'preview-asset', width: 1, height: 1, scale: 100, source: { kind: 'embedded' as const, fileName: 'inside.studio' }, smartFilters: [], embeddedDocument: nested }],
    }
    const blob = new Blob([Uint8Array.from([1])], { type: 'image/png' })
    const assets: AssetMap = {
      'preview-asset': { element: {} as HTMLImageElement, name: 'Preview', blob },
      'inside-asset': { element: {} as HTMLImageElement, name: 'Inside', blob },
    }

    const serialized = JSON.parse(await serializeProject(document, assets)) as { assets: Array<{ id: string }> }

    expect(serialized.assets.map((asset) => asset.id).sort()).toEqual(['inside-asset', 'preview-asset'])
  })

  it('streams portable project assets without assembling a full data URL', async () => {
    const bytes = Uint8Array.from({ length: 70_001 }, (_, index) => index % 251)
    const document = {
      ...initialDocument,
      layers: [{
        id: 'pixels', type: 'raster' as const, name: 'Pixels', visible: true, locked: false, opacity: 100,
        position: { x: 0, y: 0 }, rotation: 0, assetId: 'pixels', width: 1, height: 1, scale: 100,
      }],
    }
    const assets: AssetMap = {
      pixels: { element: {} as HTMLImageElement, name: 'Pixels', blob: new Blob([bytes], { type: 'image/png' }) },
    }
    const writable = new MemoryWritable()

    await writeProjectStream(writable, document, assets)
    const parsed = JSON.parse(writable.chunks.join('')) as { assets: Array<{ data: string }> }
    const decoded = new Uint8Array(await (await fetch(parsed.assets[0].data)).arrayBuffer())

    expect(writable.closed).toBe(true)
    expect(writable.chunks.length).toBeGreaterThan(5)
    expect(decoded).toEqual(bytes)
  })

  it('rejects unknown future document schemas', () => {
    expect(() => migrateDocument({ ...initialDocument, schemaVersion: 99 }, STUDIO_PROJECT_VERSION))
      .toThrow('That Studio document schema version is not supported.')
  })

  it('estimates only referenced runtime assets for scratch-storage routing', () => {
    const document = {
      ...initialDocument,
      layers: [{
        id: 'pixels', type: 'raster' as const, name: 'Pixels', visible: true, locked: false, opacity: 100,
        position: { x: 0, y: 0 }, rotation: 0, assetId: 'used', width: 10, height: 10, scale: 100,
      }],
    }
    const assets: AssetMap = {
      used: {
        element: {} as HTMLImageElement,
        name: 'Used',
        blob: new Blob([new Uint8Array(20)]),
        surface: { width: 10, height: 10 } as HTMLCanvasElement,
        precision: { bitDepth: 16, width: 1, height: 1, data: new Uint16Array(4), revision: 0 },
      },
      unused: { element: {} as HTMLImageElement, name: 'Unused', blob: new Blob([new Uint8Array(1_000)]) },
    }

    expect(estimateProjectAssetBytes(document, assets)).toBe(408)
  })
})
