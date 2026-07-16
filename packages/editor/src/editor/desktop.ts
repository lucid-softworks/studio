export type DesktopNativeFile = { name: string; type: string; data: ArrayBuffer; path?: string; lastModified?: number }
export type DesktopBridge = {
  openFile(): Promise<DesktopNativeFile | null>
  saveBlob(filename: string, type: string, data: ArrayBuffer): Promise<{ canceled: boolean; path?: string }>
  writeClipboardImage(dataUrl: string): Promise<boolean>
  pickColor(): Promise<string | null>
  writeScratch(key: string, data: ArrayBuffer): Promise<{ path: string; bytes: number }>
  clearScratch(): Promise<boolean>
  setScratchLimit(bytes: number): Promise<boolean>
  onOpenFile(listener: (file: DesktopNativeFile) => void): () => void
  onCommand(listener: (command: string) => void): () => void
  onExternalChange(listener: (change: { path: string; at: string }) => void): () => void
}

declare global { interface Window { studioDesktop?: DesktopBridge } }

export function desktopBridge() { return typeof window === 'undefined' ? undefined : window.studioDesktop }

export function nativeFile(native: DesktopNativeFile) {
  return new File([native.data], native.name, { type: native.type, lastModified: native.lastModified ?? Date.now() })
}
