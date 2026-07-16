import { desktopBridge } from './desktop'

export type BrowserWritable = {
  write(data: Blob | BufferSource | string): Promise<void>
  close(): Promise<void>
  abort?(reason?: unknown): Promise<void>
}

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<{ createWritable(): Promise<BrowserWritable> }>
}

export async function openBrowserWritable(
  suggestedName: string,
  description: string,
  mimeType: string,
  extensions: string[],
): Promise<BrowserWritable | null> {
  if (desktopBridge()) return null
  const picker = (window as SavePickerWindow).showSaveFilePicker
  if (!picker) return null
  const handle = await picker.call(window, { suggestedName, types: [{ description, accept: { [mimeType]: extensions } }] })
  return handle.createWritable()
}

export async function writeBlobIncrementally(writable: BrowserWritable, blob: Blob) {
  const reader = blob.stream().getReader()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      await writable.write(chunk.value)
    }
    await writable.close()
  } catch (error) {
    await writable.abort?.(error).catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
}
