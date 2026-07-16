import type { BrushDynamics } from '../editor/resources'

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
  dynamics: BrushDynamics
  onDynamicsChange: (value: BrushDynamics) => void
  calibration: { minimum: number; maximum: number; gamma: number }
  onCalibrationChange: (value: { minimum: number; maximum: number; gamma: number }) => void
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
        <details className="border-t border-white/[0.07] pt-3" open>
          <summary className="cursor-pointer text-[9px] font-semibold tracking-[0.12em] text-zinc-600 uppercase">Shape & scattering</summary>
          <div className="mt-3 space-y-3">
            <SettingRange label="Scatter" value={props.dynamics.scatter} min={0} max={300} onChange={(scatter) => props.onDynamicsChange({ ...props.dynamics, scatter })} />
            <SettingRange label="Count" value={props.dynamics.count} min={1} max={12} onChange={(count) => props.onDynamicsChange({ ...props.dynamics, count })} />
            <SettingRange label="Angle jitter" value={props.dynamics.angleJitter} min={0} max={180} onChange={(angleJitter) => props.onDynamicsChange({ ...props.dynamics, angleJitter })} />
            <SettingRange label="Roundness" value={props.dynamics.roundness} min={5} max={100} onChange={(roundness) => props.onDynamicsChange({ ...props.dynamics, roundness })} />
            <SettingRange label="Texture" value={props.dynamics.texture} min={0} max={100} onChange={(texture) => props.onDynamicsChange({ ...props.dynamics, texture })} />
            <SettingRange label="Smoothing" value={props.dynamics.smoothing} min={0} max={100} onChange={(smoothing) => props.onDynamicsChange({ ...props.dynamics, smoothing })} />
            <label className="flex items-center justify-between text-[9px] text-zinc-500">Dual brush<input type="checkbox" checked={props.dynamics.dualBrush} onChange={(event) => props.onDynamicsChange({ ...props.dynamics, dualBrush: event.target.checked })} className="accent-violet-500" /></label>
            <label className="flex items-center justify-between text-[9px] text-zinc-500">Build-up<input type="checkbox" checked={props.dynamics.buildUp} onChange={(event) => props.onDynamicsChange({ ...props.dynamics, buildUp: event.target.checked })} className="accent-violet-500" /></label>
          </div>
        </details>
        <details className="border-t border-white/[0.07] pt-3">
          <summary className="cursor-pointer text-[9px] font-semibold tracking-[0.12em] text-zinc-600 uppercase">Colour dynamics</summary>
          <div className="mt-3 space-y-3"><SettingRange label="Hue jitter" value={props.dynamics.hueJitter} min={0} max={180} onChange={(hueJitter) => props.onDynamicsChange({ ...props.dynamics, hueJitter })} /><SettingRange label="Saturation jitter" value={props.dynamics.saturationJitter} min={0} max={100} onChange={(saturationJitter) => props.onDynamicsChange({ ...props.dynamics, saturationJitter })} /><SettingRange label="Brightness jitter" value={props.dynamics.brightnessJitter} min={0} max={100} onChange={(brightnessJitter) => props.onDynamicsChange({ ...props.dynamics, brightnessJitter })} /></div>
        </details>
        <details className="border-t border-white/[0.07] pt-3">
          <summary className="cursor-pointer text-[9px] font-semibold tracking-[0.12em] text-zinc-600 uppercase">Tablet calibration</summary>
          <div className="mt-3 space-y-3">
            <SettingRange label="Minimum pressure" value={Math.round(props.calibration.minimum * 100)} min={0} max={80} onChange={(minimum) => props.onCalibrationChange({ ...props.calibration, minimum: minimum / 100 })} />
            <SettingRange label="Maximum pressure" value={Math.round(props.calibration.maximum * 100)} min={20} max={100} onChange={(maximum) => props.onCalibrationChange({ ...props.calibration, maximum: maximum / 100 })} />
            <SettingRange label="Pressure curve" value={Math.round(props.calibration.gamma * 100)} min={20} max={300} onChange={(gamma) => props.onCalibrationChange({ ...props.calibration, gamma: gamma / 100 })} />
            <label className="flex items-center justify-between text-[9px] text-zinc-500">Tilt controls size<input type="checkbox" checked={props.dynamics.tiltSize} onChange={(event) => props.onDynamicsChange({ ...props.dynamics, tiltSize: event.target.checked })} className="accent-violet-500" /></label>
            <label className="flex items-center justify-between text-[9px] text-zinc-500">Twist controls rotation<input type="checkbox" checked={props.dynamics.twistRotation} onChange={(event) => props.onDynamicsChange({ ...props.dynamics, twistRotation: event.target.checked })} className="accent-violet-500" /></label>
            <p className="text-[8px] leading-relaxed text-zinc-700">Pen tilt, twist, and barrel-button state are read from Pointer Events. Calibration stays on this device.</p>
          </div>
        </details>
      </div>
    </details>
  )
}
