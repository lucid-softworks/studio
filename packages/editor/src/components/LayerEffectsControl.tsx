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

function EffectBlend({ value, onChange }: { value: LayerEffects['colorOverlay']['blendMode']; onChange: (value: LayerEffects['colorOverlay']['blendMode']) => void }) {
  const values = [...new Set([value, 'normal', 'multiply', 'screen', 'overlay', 'soft-light'])] as LayerEffects['colorOverlay']['blendMode'][]
  return <label className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">Blend<select aria-label="Effect blend mode" value={value} onChange={(event) => onChange(event.target.value as LayerEffects['colorOverlay']['blendMode'])} className="rounded border border-white/[0.08] bg-zinc-950 px-1.5 py-1 text-[10px] text-zinc-300">{values.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label>
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
      <EffectBlend value={effects.dropShadow.blendMode} onChange={(blendMode) => update('dropShadow', { blendMode })} />
    </div>}

    <EffectToggle label="Inner shadow" enabled={effects.innerShadow.enabled} onClick={() => update('innerShadow', { enabled: !effects.innerShadow.enabled })} />
    {effects.innerShadow.enabled && <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/15 p-3">
      <EffectColor label="Inner shadow" value={effects.innerShadow.color} onChange={(color) => update('innerShadow', { color }, `inner-shadow-color-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Opacity" value={effects.innerShadow.opacity} min={0} max={100} suffix="%" onChange={(opacity) => update('innerShadow', { opacity }, `inner-shadow-opacity-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Angle" value={effects.innerShadow.angle} min={-180} max={180} suffix="°" onChange={(angle) => update('innerShadow', { angle }, `inner-shadow-angle-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Distance" value={effects.innerShadow.distance} min={0} max={100} suffix="px" onChange={(distance) => update('innerShadow', { distance }, `inner-shadow-distance-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Size" value={effects.innerShadow.blur} min={0} max={80} suffix="px" onChange={(blur) => update('innerShadow', { blur }, `inner-shadow-size-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <EffectBlend value={effects.innerShadow.blendMode} onChange={(blendMode) => update('innerShadow', { blendMode })} />
    </div>}

    <EffectToggle label="Outer glow" enabled={effects.outerGlow.enabled} onClick={() => update('outerGlow', { enabled: !effects.outerGlow.enabled })} />
    {effects.outerGlow.enabled && <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/15 p-3">
      <EffectColor label="Outer glow" value={effects.outerGlow.color} onChange={(color) => update('outerGlow', { color }, `outer-glow-color-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Opacity" value={effects.outerGlow.opacity} min={0} max={100} suffix="%" onChange={(opacity) => update('outerGlow', { opacity }, `outer-glow-opacity-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Size" value={effects.outerGlow.size} min={0} max={80} suffix="px" onChange={(size) => update('outerGlow', { size }, `outer-glow-size-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <EffectBlend value={effects.outerGlow.blendMode} onChange={(blendMode) => update('outerGlow', { blendMode })} />
    </div>}

    <EffectToggle label="Inner glow" enabled={effects.innerGlow.enabled} onClick={() => update('innerGlow', { enabled: !effects.innerGlow.enabled })} />
    {effects.innerGlow.enabled && <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/15 p-3">
      <EffectColor label="Inner glow" value={effects.innerGlow.color} onChange={(color) => update('innerGlow', { color }, `inner-glow-color-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Opacity" value={effects.innerGlow.opacity} min={0} max={100} suffix="%" onChange={(opacity) => update('innerGlow', { opacity }, `inner-glow-opacity-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Size" value={effects.innerGlow.size} min={0} max={80} suffix="px" onChange={(size) => update('innerGlow', { size }, `inner-glow-size-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <EffectBlend value={effects.innerGlow.blendMode} onChange={(blendMode) => update('innerGlow', { blendMode })} />
    </div>}

    <EffectToggle label="Bevel & emboss" enabled={effects.bevel.enabled} onClick={() => update('bevel', { enabled: !effects.bevel.enabled })} />
    {effects.bevel.enabled && <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/15 p-3">
      <RangeControl label="Size" value={effects.bevel.size} min={0} max={80} suffix="px" onChange={(size) => update('bevel', { size }, `bevel-size-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Depth" value={effects.bevel.depth} min={1} max={1000} suffix="%" onChange={(depth) => update('bevel', { depth }, `bevel-depth-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Angle" value={effects.bevel.angle} min={-180} max={180} suffix="°" onChange={(angle) => update('bevel', { angle }, `bevel-angle-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <EffectColor label="Bevel highlight" value={effects.bevel.highlightColor} onChange={(highlightColor) => update('bevel', { highlightColor }, `bevel-highlight-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <EffectColor label="Bevel shadow" value={effects.bevel.shadowColor} onChange={(shadowColor) => update('bevel', { shadowColor }, `bevel-shadow-${layer.id}`)} onChangeEnd={onChangeEnd} />
    </div>}

    <EffectToggle label="Satin" enabled={effects.satin.enabled} onClick={() => update('satin', { enabled: !effects.satin.enabled })} />
    {effects.satin.enabled && <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/15 p-3">
      <EffectColor label="Satin" value={effects.satin.color} onChange={(color) => update('satin', { color }, `satin-color-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Opacity" value={effects.satin.opacity} min={0} max={100} suffix="%" onChange={(opacity) => update('satin', { opacity }, `satin-opacity-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Distance" value={effects.satin.distance} min={0} max={100} suffix="px" onChange={(distance) => update('satin', { distance }, `satin-distance-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Size" value={effects.satin.size} min={0} max={80} suffix="px" onChange={(size) => update('satin', { size }, `satin-size-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <EffectBlend value={effects.satin.blendMode} onChange={(blendMode) => update('satin', { blendMode })} />
    </div>}

    <EffectToggle label="Color overlay" enabled={effects.colorOverlay.enabled} onClick={() => update('colorOverlay', { enabled: !effects.colorOverlay.enabled })} />
    {effects.colorOverlay.enabled && <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/15 p-3">
      <EffectColor label="Color overlay" value={effects.colorOverlay.color} onChange={(color) => update('colorOverlay', { color }, `color-overlay-color-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Opacity" value={effects.colorOverlay.opacity} min={0} max={100} suffix="%" onChange={(opacity) => update('colorOverlay', { opacity }, `color-overlay-opacity-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <EffectBlend value={effects.colorOverlay.blendMode} onChange={(blendMode) => update('colorOverlay', { blendMode })} />
    </div>}

    <EffectToggle label="Gradient overlay" enabled={effects.gradientOverlay.enabled} onClick={() => update('gradientOverlay', { enabled: !effects.gradientOverlay.enabled })} />
    {effects.gradientOverlay.enabled && <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/15 p-3">
      <EffectColor label="Gradient start" value={effects.gradientOverlay.colorStops[0]?.color ?? '#000000'} onChange={(color) => update('gradientOverlay', { colorStops: [{ color, position: 0 }, effects.gradientOverlay.colorStops[1] ?? { color: '#ffffff', position: 1 }] }, `gradient-start-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <EffectColor label="Gradient end" value={effects.gradientOverlay.colorStops.at(-1)?.color ?? '#ffffff'} onChange={(color) => update('gradientOverlay', { colorStops: [effects.gradientOverlay.colorStops[0] ?? { color: '#000000', position: 0 }, { color, position: 1 }] }, `gradient-end-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Opacity" value={effects.gradientOverlay.opacity} min={0} max={100} suffix="%" onChange={(opacity) => update('gradientOverlay', { opacity }, `gradient-opacity-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Angle" value={effects.gradientOverlay.angle} min={-180} max={180} suffix="°" onChange={(angle) => update('gradientOverlay', { angle }, `gradient-angle-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Scale" value={effects.gradientOverlay.scale} min={10} max={500} suffix="%" onChange={(scale) => update('gradientOverlay', { scale }, `gradient-scale-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <EffectBlend value={effects.gradientOverlay.blendMode} onChange={(blendMode) => update('gradientOverlay', { blendMode })} />
    </div>}

    <EffectToggle label="Pattern overlay" enabled={effects.patternOverlay.enabled} onClick={() => update('patternOverlay', { enabled: !effects.patternOverlay.enabled })} />
    {effects.patternOverlay.enabled && <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/15 p-3">
      <label className="flex items-center justify-between text-[10px] text-zinc-500">Pattern<input aria-label="Pattern overlay name" value={effects.patternOverlay.name} onChange={(event) => update('patternOverlay', { name: event.target.value }, `pattern-name-${layer.id}`)} onBlur={onChangeEnd} className="w-28 rounded border border-white/[0.08] bg-zinc-950 px-2 py-1 text-zinc-300" /></label>
      <RangeControl label="Opacity" value={effects.patternOverlay.opacity} min={0} max={100} suffix="%" onChange={(opacity) => update('patternOverlay', { opacity }, `pattern-opacity-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Scale" value={effects.patternOverlay.scale} min={10} max={500} suffix="%" onChange={(scale) => update('patternOverlay', { scale }, `pattern-scale-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <EffectBlend value={effects.patternOverlay.blendMode} onChange={(blendMode) => update('patternOverlay', { blendMode })} />
    </div>}

    <EffectToggle label="Stroke" enabled={effects.stroke.enabled} onClick={() => update('stroke', { enabled: !effects.stroke.enabled })} />
    {effects.stroke.enabled && <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/15 p-3">
      <label className="flex items-center justify-between text-[10px] text-zinc-500">Fill<select aria-label="Stroke fill type" value={effects.stroke.fillType} onChange={(event) => update('stroke', { fillType: event.target.value as LayerEffects['stroke']['fillType'] })} className="rounded border border-white/[0.08] bg-zinc-950 px-1.5 py-1 text-[10px] text-zinc-300"><option value="color">Colour</option><option value="gradient">Gradient</option><option value="pattern">Pattern</option></select></label>
      {effects.stroke.fillType === 'color' && <EffectColor label="Stroke" value={effects.stroke.color} onChange={(color) => update('stroke', { color }, `stroke-color-${layer.id}`)} onChangeEnd={onChangeEnd} />}
      {effects.stroke.fillType === 'gradient' && <><EffectColor label="Gradient start" value={effects.stroke.gradient.colorStops[0]?.color ?? '#000000'} onChange={(color) => update('stroke', { gradient: { ...effects.stroke.gradient, colorStops: [{ color, position: 0 }, effects.stroke.gradient.colorStops.at(-1) ?? { color: '#ffffff', position: 1 }] } }, `stroke-gradient-start-${layer.id}`)} onChangeEnd={onChangeEnd} /><EffectColor label="Gradient end" value={effects.stroke.gradient.colorStops.at(-1)?.color ?? '#ffffff'} onChange={(color) => update('stroke', { gradient: { ...effects.stroke.gradient, colorStops: [effects.stroke.gradient.colorStops[0] ?? { color: '#000000', position: 0 }, { color, position: 1 }] } }, `stroke-gradient-end-${layer.id}`)} onChangeEnd={onChangeEnd} /><RangeControl label="Angle" value={effects.stroke.gradient.angle} min={-180} max={180} suffix="°" onChange={(angle) => update('stroke', { gradient: { ...effects.stroke.gradient, angle } }, `stroke-gradient-angle-${layer.id}`)} onChangeEnd={onChangeEnd} /></>}
      {effects.stroke.fillType === 'pattern' && <><label className="flex items-center justify-between text-[10px] text-zinc-500">Pattern<input aria-label="Stroke pattern name" value={effects.stroke.pattern.name} onChange={(event) => update('stroke', { pattern: { ...effects.stroke.pattern, name: event.target.value } }, `stroke-pattern-name-${layer.id}`)} onBlur={onChangeEnd} className="w-28 rounded border border-white/[0.08] bg-zinc-950 px-2 py-1 text-zinc-300" /></label><RangeControl label="Scale" value={effects.stroke.pattern.scale} min={10} max={500} suffix="%" onChange={(scale) => update('stroke', { pattern: { ...effects.stroke.pattern, scale } }, `stroke-pattern-scale-${layer.id}`)} onChangeEnd={onChangeEnd} /></>}
      <RangeControl label="Opacity" value={effects.stroke.opacity} min={0} max={100} suffix="%" onChange={(opacity) => update('stroke', { opacity }, `stroke-opacity-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <RangeControl label="Size" value={effects.stroke.size} min={1} max={100} suffix="px" onChange={(size) => update('stroke', { size }, `stroke-size-${layer.id}`)} onChangeEnd={onChangeEnd} />
      <EffectBlend value={effects.stroke.blendMode} onChange={(blendMode) => update('stroke', { blendMode })} />
    </div>}
  </ControlSection>
}
