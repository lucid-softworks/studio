import type { SourceImage } from '../runtime-assets'

export type RenderResourceFactoryResult<T> = {
  resource: T
  dispose?: () => void
}

type ResourceEntry = {
  source: SourceImage
  revision: number
  resource: unknown
  dispose?: () => void
}

export class RenderResourceRegistry {
  private readonly backends = new Map<string, Map<string, ResourceEntry>>()

  resolve<T>(
    backend: string,
    assetId: string,
    source: SourceImage,
    factory: (source: SourceImage) => RenderResourceFactoryResult<T>,
  ): T {
    let resources = this.backends.get(backend)
    if (!resources) {
      resources = new Map()
      this.backends.set(backend, resources)
    }

    const revision = source.revision ?? 0
    const existing = resources.get(assetId)
    if (existing?.source === source && existing.revision === revision) return existing.resource as T

    existing?.dispose?.()
    const created = factory(source)
    resources.set(assetId, { source, revision, resource: created.resource, dispose: created.dispose })
    return created.resource
  }

  invalidateAsset(assetId: string) {
    for (const resources of this.backends.values()) {
      const entry = resources.get(assetId)
      entry?.dispose?.()
      resources.delete(assetId)
    }
  }

  prune(backend: string, liveAssetIds: ReadonlySet<string>) {
    const resources = this.backends.get(backend)
    if (!resources) return
    for (const [assetId, entry] of resources) {
      if (liveAssetIds.has(assetId)) continue
      entry.dispose?.()
      resources.delete(assetId)
    }
  }

  disposeBackend(backend: string) {
    const resources = this.backends.get(backend)
    if (!resources) return
    for (const entry of resources.values()) entry.dispose?.()
    this.backends.delete(backend)
  }

  dispose() {
    for (const backend of [...this.backends.keys()]) this.disposeBackend(backend)
  }
}
