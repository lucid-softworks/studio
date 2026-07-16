import { useEffect, useRef, useState } from 'react'
import { downloadBlob } from '../editor/download'
import type { EditorDocument } from '../editor/types'
import { ModalDialog } from './ModalDialog'

type ScriptFile = { name: string; text: string }
type SandboxResult = { token: string; logs?: string[]; files?: Array<{ name: string; data: string; type?: string }>; error?: string }
type SavedScript = { id: string; name: string; code: string }

const sandboxCloseTag = '</script>'
const sandboxSource = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'"><script>
addEventListener('message', async (event) => {
  const { token, code, context } = event.data || {};
  if (!token || typeof code !== 'string') return;
  const logs = [], files = [];
  const studio = Object.freeze({
    document: Object.freeze(context.document),
    inputFiles: Object.freeze(context.inputFiles),
    log: (...values) => logs.push(values.map(String).join(' ')),
    writeFile: (name, data, type = 'text/plain') => files.push({ name: String(name).slice(0, 128), data: String(data), type: String(type) }),
  });
  try {
    const execute = new Function('studio', '"use strict"; return (async () => { ' + code + '\n})()');
    await execute(studio);
    parent.postMessage({ token, logs, files }, '*');
  } catch (error) { parent.postMessage({ token, logs, error: error && error.message ? error.message : String(error) }, '*'); }
});
parent.postMessage({ kind: 'studio-sandbox-ready' }, '*');
${sandboxCloseTag}`

function loadScripts(): SavedScript[] {
  try {
    const value = JSON.parse(localStorage.getItem('studio.local-scripts:v1') ?? localStorage.getItem('studio.local-scripts') ?? '[]') as unknown
    if (!Array.isArray(value)) return []
    return value.flatMap((entry): SavedScript[] => entry && typeof entry === 'object' && typeof (entry as SavedScript).name === 'string' && typeof (entry as SavedScript).code === 'string' ? [{ id: typeof (entry as SavedScript).id === 'string' ? (entry as SavedScript).id : crypto.randomUUID(), name: (entry as SavedScript).name.slice(0, 48), code: (entry as SavedScript).code.slice(0, 100_000) }] : []).slice(0, 32)
  } catch { return [] }
}

export function ScriptSandboxDialog({ document, onClose }: { document: EditorDocument; onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const pendingRef = useRef<{ token: string; resolve: (result: SandboxResult) => void } | null>(null)
  const [name, setName] = useState('Untitled script')
  const [code, setCode] = useState("studio.log('Document:', studio.document.canvasSize.width, '×', studio.document.canvasSize.height)\n")
  const [scripts, setScripts] = useState<SavedScript[]>(loadScripts)
  const [allowRead, setAllowRead] = useState(false)
  const [allowWrite, setAllowWrite] = useState(false)
  const inputFilesRef = useRef<ScriptFile[]>([])
  const [output, setOutput] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [sandboxReady, setSandboxReady] = useState(false)

  useEffect(() => { try { localStorage.setItem('studio.local-scripts:v1', JSON.stringify(scripts)) } catch { /* Script storage is optional. */ } }, [scripts])
  useEffect(() => {
    const receive = (event: MessageEvent<SandboxResult>) => {
      const pending = pendingRef.current
      if (!pending || event.source !== iframeRef.current?.contentWindow || event.data?.token !== pending.token) return
      pendingRef.current = null
      pending.resolve(event.data)
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [])

  const run = async () => {
    const target = iframeRef.current?.contentWindow
    if (!target || running) return
    setRunning(true); setOutput([])
    const token = crypto.randomUUID()
    const result = await new Promise<SandboxResult>((resolve) => {
      pendingRef.current = { token, resolve }
      target.postMessage({ token, code, context: { document: structuredClone(document), inputFiles: allowRead ? inputFilesRef.current : [] } }, '*')
    })
    setRunning(false)
    const logs = result.logs ?? []
    if (result.error) logs.push(`Error: ${result.error}`)
    if (result.files?.length && !allowWrite) logs.push(`Blocked ${result.files.length} output file${result.files.length === 1 ? '' : 's'}: write permission is off.`)
    if (allowWrite) for (const file of result.files ?? []) downloadBlob(new Blob([file.data], { type: file.type || 'text/plain' }), file.name || 'script-output.txt')
    setOutput(logs.length ? logs : ['Script completed.'])
  }

  const save = () => {
    const script = { id: crypto.randomUUID(), name: name.trim().slice(0, 48) || 'Untitled script', code }
    setScripts((current) => [...current, script].slice(-32))
  }

  return <ModalDialog label="Local scripting" onDismiss={onClose} className="z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><section className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#17171a] shadow-2xl"><header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4"><div><h2 className="text-sm font-semibold text-zinc-100">Local script sandbox</h2><p className="mt-1 text-[10px] text-zinc-600">Opaque-origin iframe · network blocked by CSP · explicit file permissions</p></div><button type="button" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-200">×</button></header><div className="grid min-h-0 flex-1 grid-cols-[180px_1fr]"><aside className="overflow-y-auto border-r border-white/[0.07] p-3"><button type="button" onClick={() => { setName('Untitled script'); setCode('') }} className="mb-2 w-full rounded-md border border-white/[0.08] py-2 text-[9px] text-zinc-500">+ New script</button>{scripts.map((script) => <div key={script.id} className="group mb-1 flex rounded-md bg-white/[0.025]"><button type="button" onClick={() => { setName(script.name); setCode(script.code) }} className="min-w-0 flex-1 truncate px-2 py-2 text-left text-[9px] text-zinc-500 hover:text-zinc-200">{script.name}</button><button type="button" aria-label={`Delete ${script.name}`} onClick={() => setScripts((current) => current.filter((candidate) => candidate.id !== script.id))} className="px-2 text-zinc-800 opacity-0 hover:text-red-300 group-hover:opacity-100">×</button></div>)}</aside><main className="flex min-h-0 flex-col p-4"><div className="flex gap-2"><input aria-label="Script name" value={name} onChange={(event) => setName(event.target.value)} className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-black/20 px-3 py-2 text-[10px] text-zinc-300 outline-none" /><button type="button" onClick={save} className="rounded-md border border-white/[0.08] px-3 text-[9px] text-zinc-500 hover:text-zinc-200">Save locally</button></div><textarea aria-label="Script code" spellCheck={false} value={code} onChange={(event) => setCode(event.target.value)} className="mt-3 min-h-52 flex-1 resize-none rounded-lg border border-white/[0.08] bg-[#0d0d0f] p-3 font-mono text-[11px] leading-relaxed text-zinc-300 outline-none focus:border-violet-400/40" /><div className="mt-3 grid grid-cols-2 gap-2"><label className="rounded-lg border border-white/[0.07] bg-black/15 p-2 text-[9px] text-zinc-500"><span className="flex items-center gap-2"><input type="checkbox" checked={allowRead} onChange={(event) => setAllowRead(event.target.checked)} />Allow selected file reads</span><input type="file" multiple disabled={!allowRead} onChange={async (event) => { const files = await Promise.all(Array.from(event.target.files ?? []).map(async (file) => ({ name: file.name, text: await file.text() }))); inputFilesRef.current = files }} className="mt-2 block w-full text-[8px] text-zinc-700 file:mr-2 file:rounded file:border-0 file:bg-white/[0.05] file:px-2 file:py-1 file:text-zinc-500" /></label><label className="rounded-lg border border-white/[0.07] bg-black/15 p-2 text-[9px] text-zinc-500"><span className="flex items-center gap-2"><input type="checkbox" checked={allowWrite} onChange={(event) => setAllowWrite(event.target.checked)} />Allow output downloads</span><p className="mt-2 text-[8px] leading-relaxed text-zinc-700">Scripts can only emit new files after this permission is enabled.</p></label></div>{output.length > 0 && <pre className="mt-3 max-h-24 overflow-auto rounded-lg bg-black/25 p-2 font-mono text-[9px] whitespace-pre-wrap text-zinc-500">{output.join('\n')}</pre>}<button type="button" disabled={!sandboxReady || running || !code.trim()} onClick={() => void run()} className="mt-3 rounded-lg bg-violet-500 py-2.5 text-[10px] font-semibold text-white disabled:opacity-40">{running ? 'Running in sandbox…' : sandboxReady ? 'Run script' : 'Starting sandbox…'}</button></main></div><iframe ref={iframeRef} title="Studio script sandbox" sandbox="allow-scripts" srcDoc={sandboxSource} onLoad={() => setSandboxReady(true)} className="hidden" /></section></ModalDialog>
}
