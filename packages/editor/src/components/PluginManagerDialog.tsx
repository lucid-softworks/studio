import { useState } from 'react'
import { downloadBlob } from '../editor/download'
import { parsePluginFile, type StudioPlugin } from '../editor/plugins'
import { ModalDialog } from './ModalDialog'

const examplePlugin = {
  app: 'studio-plugin', version: 1, id: 'example.web-tools', name: 'Example Web Tools', hooks: {
    importers: [{ id: 'custom-image', label: 'Custom image', extensions: ['custompng'] }],
    exporters: [{ id: 'webp-export', label: 'Optimized WebP', format: 'webp' }],
    filters: [{ id: 'warm', label: 'Warm matrix', matrix: [1.08, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 1, 0] }],
    panels: [{ id: 'about', label: 'Web Tools', description: 'A local declarative plugin panel.' }],
    tools: [{ id: 'ink', label: 'Web Ink', target: 'brush', mark: 'W' }],
  },
} as const

export function PluginManagerDialog({ plugins, onChange, onClose }: { plugins: StudioPlugin[]; onChange: (plugins: StudioPlugin[]) => void; onClose: () => void }) {
  const [error, setError] = useState('')
  const install = async (file: File) => {
    try {
      const plugin = await parsePluginFile(file)
      onChange([...plugins.filter((candidate) => candidate.id !== plugin.id), plugin])
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The plugin could not be installed.') }
  }
  return <ModalDialog label="Plugin manager" onDismiss={onClose} className="z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><section className="flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#17171a] shadow-2xl"><header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4"><div><h2 className="text-sm font-semibold text-zinc-100">Local plugins</h2><p className="mt-1 text-[10px] text-zinc-600">Declarative hooks only · no arbitrary plugin code · stored in this browser</p></div><button type="button" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-200">×</button></header><div className="flex items-center gap-2 border-b border-white/[0.07] p-3"><label className="cursor-pointer rounded-lg bg-violet-500 px-3 py-2 text-[10px] font-semibold text-white">Install manifest…<input type="file" accept=".studio-plugin,.json,application/json" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void install(file); event.target.value = '' }} /></label><button type="button" onClick={() => downloadBlob(new Blob([JSON.stringify(examplePlugin, null, 2)], { type: 'application/json' }), 'example.studio-plugin')} className="rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] text-zinc-500 hover:text-zinc-200">Example manifest</button><span className="ml-auto text-[9px] text-zinc-700">{plugins.length}/32 installed</span></div>{error && <p className="mx-3 mt-3 rounded-lg border border-red-400/20 bg-red-400/[0.06] p-2 text-[9px] text-red-200">{error}</p>}<div className="min-h-0 flex-1 overflow-y-auto p-3">{plugins.length ? plugins.map((plugin) => <article key={plugin.id} className="mb-2 rounded-xl border border-white/[0.07] bg-black/15 p-3"><div className="flex items-start justify-between"><div><h3 className="text-[11px] font-semibold text-zinc-300">{plugin.name}</h3><p className="mt-0.5 font-mono text-[8px] text-zinc-700">{plugin.id}</p></div><button type="button" onClick={() => onChange(plugins.filter((candidate) => candidate.id !== plugin.id))} className="rounded px-2 py-1 text-[9px] text-zinc-700 hover:text-red-300">Remove</button></div><div className="mt-3 grid grid-cols-5 gap-1">{Object.entries(plugin.hooks).map(([kind, hooks]) => <div key={kind} className="rounded-md bg-white/[0.025] p-1.5 text-center"><span className="block font-mono text-[10px] text-zinc-400">{hooks.length}</span><span className="block text-[7px] text-zinc-700 capitalize">{kind}</span></div>)}</div>{plugin.hooks.panels.map((panel) => <section key={panel.id} className="mt-2 rounded-md border border-white/[0.05] p-2"><p className="text-[9px] font-medium text-zinc-500">{panel.label}</p><p className="mt-1 text-[8px] leading-relaxed whitespace-pre-wrap text-zinc-700">{panel.description}</p></section>)}</article>) : <div className="rounded-xl border border-dashed border-white/[0.08] p-8 text-center"><p className="text-[11px] text-zinc-500">No plugins installed</p><p className="mt-2 text-[9px] leading-relaxed text-zinc-700">Studio plugins can declare importer, exporter, color-matrix filter, panel, and mapped-tool hooks without running arbitrary code.</p></div>}</div></section></ModalDialog>
}
