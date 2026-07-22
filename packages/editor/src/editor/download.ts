import { desktopBridge } from './desktop'

export function downloadBlob(blob: Blob, filename: string) {
  const desktop = desktopBridge()
  if (desktop) {
    void blob.arrayBuffer().then((data) => desktop.saveBlob(filename, blob.type, data)).catch((error) => window.dispatchEvent(new CustomEvent('studio:desktop-error', { detail: error instanceof Error ? error.message : 'The native save failed.' })))
    return
  }
  const url = URL.createObjectURL(blob)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
  }
}
