import { Component, type ErrorInfo, type ReactNode } from 'react'
import { createDiagnosticReport, recordDiagnosticEvent } from '../editor/diagnostics'
import { downloadBlob } from '../editor/download'

export class EditorErrorBoundary extends Component<{ children: ReactNode; onExit?: () => void }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    recordDiagnosticEvent('render-error', new Error(`${error.message}\n${info.componentStack ?? ''}`))
  }

  private exportDiagnostics = () => {
    const report = createDiagnosticReport({ recovery: { state: 'available-on-reload' } })
    downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `studio-diagnostics-${new Date().toISOString().slice(0, 10)}.json`)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <main className="flex min-h-screen items-center justify-center bg-[#0b0b0c] p-6 text-zinc-100"><section className="w-full max-w-lg rounded-2xl border border-red-400/20 bg-[#17171a] p-6 shadow-2xl"><p className="text-[9px] font-semibold tracking-[0.16em] text-red-300 uppercase">Editor recovery</p><h1 className="mt-2 text-xl font-semibold">Studio hit an unexpected error</h1><p className="mt-3 text-sm leading-relaxed text-zinc-500">Your latest local recovery snapshot is kept in this browser. Reload Studio to restore it, or export a privacy-safe diagnostic report first.</p><pre className="mt-4 max-h-24 overflow-auto rounded-lg bg-black/25 p-3 text-[10px] whitespace-pre-wrap text-zinc-600">{this.state.error.message}</pre><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-violet-500 px-4 py-2 text-xs font-semibold text-white">Reload and recover</button><button type="button" onClick={this.exportDiagnostics} className="rounded-lg border border-white/[0.1] px-4 py-2 text-xs text-zinc-400 hover:text-white">Export diagnostics</button>{this.props.onExit && <button type="button" onClick={this.props.onExit} className="rounded-lg px-4 py-2 text-xs text-zinc-600 hover:text-zinc-300">Return home</button>}</div></section></main>
  }
}
