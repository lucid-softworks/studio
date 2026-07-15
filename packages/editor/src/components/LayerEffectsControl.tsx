import { defaultLayerEffects, normalizeLayerEffects } from '../editor/effects'
import type { EditorLayer, LayerEffects, LayerPatch } from '../editor/types'
import { ControlSection, RangeControl } from './Control'

type Props = {
  layer: EditorLayer
  onUpdate: (patch: LayerPatch, groupKey?: string) => void
  onChangeEnd: () => void
}

function EffectToggle({ label, enabled, onClick }: { label: string; enabled: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={enabled} onClick={onClick} className={`mt-2 flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-xs transition first:mt-0 ${enabled ? 'border-violet-400/30 bg-violet-400/10 text-violet-200' : 'border-white/[0.08] text-zinc-500 hover:text-zinc-200'}`}><span>{label}</span><span>{enabled ? 'On' : 'Off'}</span></button>
}

function EffectColor({ label, value, onChange, onChangeEnd }: { label: string; value: string; onChange: (value: string) => void; onChangeEnd: () => void }) {
  return <label className="flex items-center justify-between text-[10px] text-zinc-500">Colour<input type="color" aria-label={`${label} color`} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onChangeEnd} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" /></label>
}

export function LayerEffectsControl({ layer, onUpdate, onChangeEnd }: Props) {
  const effects = normalizeLayerEffects(layer.effects)
  const update = <K extends keyof LayerEffects>(kind: K, patch: Partial<LayerEffects[K]>, groupKey?: string) => {
    onUpdate({ effects: { ...effects, [kind]: { ...effects[kind], ...patch } } }, groupKey)
  }

  return <ControlSection title="Layer effects">
    <div className="mb-3 flex items-center justify-between">
      <p className="text-[10px] leading-relaxed text-zinc-600">Editable, non-destructive styles</p>
      <button type="button" onClick={() => onUpdate({ effects: defaultLayerEffects })} className="rounded px-2 py-1 text-[9px] text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300">Reset</button>
    </div>

    <EffectToggle label="Drop shadow" enabled={effects.dropShadow.enabled} onClick={() => update('dropShadow', { enabled: !effects.dropShadow.enabled })} />
    {effects.dropShadow.enabled && <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/15 p-3">
      <EffectColor label="Drop shadow" value={effects.dropShadow.color} onChange={(color) => update('dropShadow', { color }, `drop-shadow-color-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Opacity" value={effects.dropShadow.opacity} min={0} max={100} suffix="%" onChange={(opacity) => update('dropShadow', { opacity }, `drop-shadow-opacity-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Angle" value={effects.dropShadow.angle} min={-180} max={180} suffix="°" onChange={(angle) => update('dropShadow', { angle }, `drop-shadow-angle-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Distance" value={effects.dropShadow.distance} min={0} max={100} suffix="px" onChange={(distance) => update('dropShadow', { distance }, `drop-shadow-distance-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Blur" value={effects.dropShadow.blur} min={0} max={80} suffix="px" onChange={(blur) => update('dropShadow', { blur }, `drop-shadow-blur-${layer.id}`)} onChangeEnd={onChangeEnd} />
    </div>}

    <EffectToggle label="Outer glow" enabled={effects.outerGlow.enabled} onClick={() => update('outerGlow', { enabled: !effects.outerGlow.enabled })} />
    {effects.outerGlow.enabled && <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/15 p-3">
      <EffectColor label="Outer glow" value={effects.outerGlow.color} onChange={(color) => update('outerGlow', { color }, `outer-glow-color-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Opacity" value={effects.outerGlow.opacity} min={0} max={100} suffix="%" onChange={(opacity) => update('outerGlow', { opacity }, `outer-glow-opacity-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Size" value={effects.outerGlow.size} min={0} max={80} suffix="px" onChange={(size) => update('outerGlow', { size }, `outer-glow-size-${layer.id}`)} onChangeEnd={onChangeEnd} />
    </div>}

    <EffectToggle label="Color overlay" enabled={effects.colorOverlay.enabled} onClick={() => update('colorOverlay', { enabled: !effects.colorOverlay.enabled })} />
    {effects.colorOverlay.enabled && <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/15 p-3">
      <EffectColor label="Color overlay" value={effects.colorOverlay.color} onChange={(color) => update('colorOverlay', { color }, `color-overlay-color-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Opacity" value={effects.colorOverlay.opacity} min={0} max={100} suffix="%" onChange={(opacity) => update('colorOverlay', { opacity }, `color-overlay-opacity-${layer.id}`)} onChangeEnd={onChangeEnd} />
    </div>}
  </ControlSection>
}
