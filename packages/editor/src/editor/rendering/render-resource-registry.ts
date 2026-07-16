import type { SourceImage } from '../runtime-assets'

export type RenderResourceFactoryResult<T> = {
  resource: T
  dispose?: () => void
  /** Bytes owned by the cached resource. May be dynamic for mip chains. */
  byteSize?: number | (() => number)
}

type ResourceEntry = {
  source: SourceImage
  revision: number
  resource: unknown
  dispose?: () => void
  byteSize: () => number
  lastUsed: number
}

export type RenderResourceRegistryOptions = {
  maxEntriesPerBackend?: number
  maxBytesPerBackend?: number
}

export type RenderResourceUsage = { entries: number; bytes: number }

const DEFAULT_MAX_ENTRIES_PER_BACKEND = 256
const DEFAULT_MAX_BYTES_PER_BACKEND = 256 * 1024 * 1024

export class RenderResourceRegistry {
  private readonly backends = new Map<string, Map<string, ResourceEntry>>()
  readonly maxEntriesPerBackend: number
  readonly maxBytesPerBackend: number
  private clock = 0

  constructor(options: RenderResourceRegistryOptions = {}) {
    this.maxEntriesPerBackend = options.maxEntriesPerBackend ?? DEFAULT_MAX_ENTRIES_PER_BACKEND
    this.maxBytesPerBackend = options.maxBytesPerBackend ?? DEFAULT_MAX_BYTES_PER_BACKEND
  }

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
    if (existing?.source === source && existing.revision === revision) {
      existing.lastUsed = ++this.clock
      this.enforceBudget(backend, assetId)
      return existing.resource as T
    }

    existing?.dispose?.()
    const created = factory(source)
    const declaredByteSize = created.byteSize
    const byteSize = typeof declaredByteSize === 'function'
      ? declaredByteSize
      : () => Math.max(0, declaredByteSize ?? 0)
    resources.set(assetId, {
      source,
      revision,
      resource: created.resource,
      dispose: created.dispose,
      byteSize,
      lastUsed: ++this.clock,
    })
    this.enforceBudget(backend, assetId)
    return created.resource
  }

  usage(backend: string): RenderResourceUsage {
    const resources = this.backends.get(backend)
    if (!resources) return { entries: 0, bytes: 0 }
    return {
      entries: resources.size,
      bytes: [...resources.values()].reduce((total, entry) => total + entry.byteSize(), 0),
    }
  }

  enforceBudget(backend: string, protectedAssetId?: string) {
    const resources = this.backends.get(backend)
    if (!resources) return
    let usage = this.usage(backend)
    while (usage.entries > this.maxEntriesPerBackend || usage.bytes > this.maxBytesPerBackend) {
      const candidate = [...resources.entries()]
        .filter(([assetId]) => assetId !== protectedAssetId)
        .sort((left, right) => left[1].lastUsed - right[1].lastUsed || left[0].localeCompare(right[0]))[0]
      if (!candidate) break
      candidate[1].dispose?.()
      resources.delete(candidate[0])
      usage = this.usage(backend)
    }
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
