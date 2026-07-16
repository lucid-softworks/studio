import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadOpfsRecovery, saveOpfsRecovery, type RecoveryStoredProject } from './opfs-recovery'

class MemoryFileHandle {
  blob = new Blob()
  readonly name: string

  constructor(name: string) { this.name = name }

  async createWritable() {
    return {
      write: async (value: Blob | string) => { this.blob = value instanceof Blob ? value : new Blob([value]) },
      close: async () => undefined,
    }
  }

  async getFile() {
    return new File([this.blob], this.name, { type: this.blob.type })
  }
}

class MemoryDirectoryHandle {
  readonly directories = new Map<string, MemoryDirectoryHandle>()
  readonly files = new Map<string, MemoryFileHandle>()

  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const existing = this.directories.get(name)
    if (existing) return existing as unknown as FileSystemDirectoryHandle
    if (!options?.create) throw new DOMException('Missing', 'NotFoundError')
    const directory = new MemoryDirectoryHandle()
    this.directories.set(name, directory)
    return directory as unknown as FileSystemDirectoryHandle
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    const existing = this.files.get(name)
    if (existing) return existing as unknown as FileSystemFileHandle
    if (!options?.create) throw new DOMException('Missing', 'NotFoundError')
    const file = new MemoryFileHandle(name)
    this.files.set(name, file)
    return file as unknown as FileSystemFileHandle
  }

  async removeEntry(name: string) {
    this.files.delete(name)
    this.directories.delete(name)
  }
}

function project(savedAt: string, byte: number): RecoveryStoredProject {
  return {
    version: 3,
    savedAt,
    document: { schemaVersion: 3 },
    assets: [{ id: 'pixels', name: 'Pixels', blob: new Blob([Uint8Array.of(byte)], { type: 'image/png' }) }],
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('OPFS recovery generations', () => {
  it('publishes complete generations and removes the replaced generation', async () => {
    const root = new MemoryDirectoryHandle()
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => root, persist: async () => true } })

    expect(await saveOpfsRecovery(project('2026-01-01T00:00:00.000Z', 1))).toBe(true)
    expect(await saveOpfsRecovery(project('2026-01-02T00:00:00.000Z', 2))).toBe(true)
    const loaded = await loadOpfsRecovery()
    const scratch = root.directories.get('studio-scratch')

    expect(loaded?.savedAt).toBe('2026-01-02T00:00:00.000Z')
    expect(new Uint8Array(await loaded!.assets[0].blob.arrayBuffer())).toEqual(Uint8Array.of(2))
    expect([...scratch!.directories.keys()]).toHaveLength(1)
  })

  it('reports unsupported storage without touching browser state', async () => {
    vi.stubGlobal('navigator', { storage: {} })
    expect(await saveOpfsRecovery(project('2026-01-01T00:00:00.000Z', 1))).toBe(false)
    expect(await loadOpfsRecovery()).toBeNull()
  })
})
