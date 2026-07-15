import { describe, expect, it } from 'vitest'
import { initialDocument } from './presets'
import { migrateDocument, parseProjectFile, serializeProject, STUDIO_PROJECT_VERSION } from './project'

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

    expect(migrated.schemaVersion).toBe(2)
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

    expect(loaded.document.schemaVersion).toBe(2)
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

  it('rejects unknown future document schemas', () => {
    expect(() => migrateDocument({ ...initialDocument, schemaVersion: 99 }, STUDIO_PROJECT_VERSION))
      .toThrow('That Studio document schema version is not supported.')
  })
})
