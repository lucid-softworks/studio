type Props = {
  hardness: number
  opacity: number
  flow: number
  spacing: number
  pressureSize: boolean
  pressureOpacity: boolean
  supportsHardness: boolean
  onHardnessChange: (value: number) => void
  onOpacityChange: (value: number) => void
  onFlowChange: (value: number) => void
  onSpacingChange: (value: number) => void
  onPressureSizeChange: (value: boolean) => void
  onPressureOpacityChange: (value: boolean) => void
}

function SettingRange({ label, value, min, max, disabled, onChange }: { label: string; value: number; min: number; max: number; disabled?: boolean; onChange: (value: number) => void }) {
  return (
    <label className={`block ${disabled ? 'opacity-35' : ''}`}>
      <span className="mb-1.5 flex items-center justify-between text-[10px] text-zinc-500"><span>{label}</span><span className="font-mono text-zinc-400">{value}%</span></span>
      <input aria-label={`Brush ${label.toLowerCase()}`} type="range" min={min} max={max} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} className="studio-range w-full" />
    </label>
  )
}

export function BrushSettingsPopover(props: Props) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-white/[0.08] px-2 py-1.5 text-[9px] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200">Settings</summary>
      <div className="absolute top-9 right-0 z-50 w-64 space-y-4 rounded-xl border border-white/[0.1] bg-[#18181b]/98 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.65)] backdrop-blur-xl">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.12em] text-zinc-500 uppercase">Brush dynamics</p>
          <p className="mt-1 text-[9px] leading-relaxed text-zinc-700">Pen pressure is used when a stylus reports it. Mouse strokes stay at full pressure.</p>
        </div>
        <SettingRange label="Hardness" value={props.hardness} min={0} max={100} disabled={!props.supportsHardness} onChange={props.onHardnessChange} />
        <SettingRange label="Opacity" value={props.opacity} min={1} max={100} onChange={props.onOpacityChange} />
        <SettingRange label="Flow" value={props.flow} min={1} max={100} onChange={props.onFlowChange} />
        <SettingRange label="Spacing" value={props.spacing} min={1} max={100} onChange={props.onSpacingChange} />
        <div className="space-y-2 border-t border-white/[0.07] pt-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 text-[10px] text-zinc-400"><span>Pressure controls size</span><input aria-label="Pressure controls brush size" type="checkbox" checked={props.pressureSize} onChange={(event) => props.onPressureSizeChange(event.target.checked)} className="accent-violet-500" /></label>
          <label className="flex cursor-pointer items-center justify-between gap-3 text-[10px] text-zinc-400"><span>Pressure controls opacity</span><input aria-label="Pressure controls brush opacity" type="checkbox" checked={props.pressureOpacity} onChange={(event) => props.onPressureOpacityChange(event.target.checked)} className="accent-violet-500" /></label>
        </div>
      </div>
    </details>
  )
}
