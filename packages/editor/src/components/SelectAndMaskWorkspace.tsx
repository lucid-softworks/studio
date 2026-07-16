import { useState } from 'react'
import { refineSelection, type SelectionRefinement, type SelectionState } from '../editor/selection'
import { ModalDialog } from './ModalDialog'

type Props = { source: SelectionState; onPreview: (selection: SelectionState) => void; onApply: () => void; onCancel: () => void }
const initial: SelectionRefinement = { radius: 0, feather: 0, contrast: 0, shiftEdge: 0, decontamination: 0 }

export function SelectAndMaskWorkspace({ source, onPreview, onApply, onCancel }: Props) {
  const [settings, setSettings] = useState(initial)
  const control = (key: keyof SelectionRefinement, label: string, min: number, max: number, suffix: string) => <label className="block"><span className="mb-1.5 flex justify-between text-[10px] text-zinc-500"><span>{label}</span><span className="font-mono text-zinc-400">{settings[key]}{suffix}</span></span><input aria-label={label} type="range" min={min} max={max} step={key === 'feather' || key === 'radius' ? 0.5 : 1} value={settings[key]} onChange={(event) => { const next = { ...settings, [key]: Number(event.target.value) }; setSettings(next); onPreview(refineSelection(source, next)) }} className="studio-range w-full" /></label>
  return <ModalDialog label="Select and Mask workspace" onDismiss={onCancel} className="z-[100] bg-black/35 backdrop-blur-[1px]"><aside className="absolute top-16 right-4 w-72 rounded-2xl border border-white/[0.1] bg-[#151518]/98 p-4 shadow-[0_30px_90px_rgba(0,0,0,0.7)]"><div className="mb-4"><h2 className="text-sm font-semibold text-zinc-100">Select and Mask</h2><p className="mt-1 text-[10px] leading-relaxed text-zinc-600">Refine the current pixel mask locally. The violet canvas overlay is a live preview.</p></div><div className="space-y-4">{control('radius', 'Edge radius', 0, 32, ' px')}{control('feather', 'Feather', 0, 64, ' px')}{control('contrast', 'Contrast', 0, 100, '%')}{control('shiftEdge', 'Shift edge', -100, 100, '%')}{control('decontamination', 'Decontaminate edge', 0, 100, '%')}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-xs text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200">Cancel</button><button type="button" onClick={onApply} className="rounded-lg bg-violet-500 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-400">Apply</button></div></aside></ModalDialog>
}
