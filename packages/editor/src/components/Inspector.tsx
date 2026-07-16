import { backgroundPresets, canvasPresets, createId } from '../editor/presets'
import { adjustmentKinds, createAdjustmentDescriptor } from '../editor/adjustments'
import { defaultLayerFilters, normalizeLayerFilters } from '../editor/filters'
import { getDescendantLayers, getStackChildren } from '../editor/stack'
import type { AdjustmentDescriptor, BlendMode, EditorDispatch, EditorDocument, EditorLayer, LayerPatch, PatternKind } from '../editor/types'
import { ControlSection, RangeControl } from './Control'
import { ImageIcon, ResetIcon } from './Icons'
import { LayerEffectsControl } from './LayerEffectsControl'
import { CollapsedPanelRail, PanelCollapseButton } from './PanelCollapseControls'
import { PanelResizeHandle } from './PanelResizeHandle'
import type { CustomFontResource } from '../editor/resources'
import type { CSSProperties, DragEvent } from 'react'

type InspectorProps = {
  document: EditorDocument
  dispatch: EditorDispatch
  endHistoryGroup: () => void
  onBackgroundImage: () => void
  backgroundImageName?: string
  customFonts: CustomFontResource[]
  onLoadFont: () => void
  onOpenSmartObject: () => void
  onReplaceSmartObject: () => void
  onRelinkSmartObject: () => void
  onExportSmartObject: () => void
  dockSide: 'left' | 'right'
  onSwapPanels: () => void
  width: number
  onWidthChange: (width: number) => void
  collapsed: boolean
  onToggleCollapsed: () => void
}

const tabClass = (active: boolean) =>
  `flex-1 rounded-md px-2 py-2 text-[11px] font-medium transition ${
    active ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
  }`

const fieldClass = 'w-full rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-xs text-zinc-200 outline-none transition placeholder:text-zinc-700 focus:border-violet-400/50'
const defaultShapeStroke = { alignment: 'center' as const, cap: 'butt' as const, join: 'miter' as const, miterLimit: 10, dashOffset: 0, dashes: [] as number[], opacity: 1, blendMode: 'normal' as const }
type ShapeFill = NonNullable<Extract<EditorLayer, { type: 'shape' }>['fillStyle']>
type GradientShapeFill = Extract<ShapeFill, { type: 'gradient' }>
type PatternShapeFill = Extract<ShapeFill, { type: 'pattern' }>

const blendModes: Array<{ value: BlendMode; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Saturation' },
  { value: 'color', label: 'Color' },
  { value: 'luminosity', label: 'Luminosity' },
]

export function Inspector({ document, dispatch, endHistoryGroup, onBackgroundImage, backgroundImageName, customFonts, onLoadFont, onOpenSmartObject, onReplaceSmartObject, onRelinkSmartObject, onExportSmartObject, dockSide, onSwapPanels, width, onWidthChange, collapsed, onToggleCollapsed }: InspectorProps) {
  const selected = document.layers.find((layer) => layer.id === document.selectedLayerId) ?? null
  const selectedGroup = document.groups.find((group) => group.id === document.selectedGroupId) ?? null
  const selectedIndex = selected ? document.layers.findIndex((layer) => layer.id === selected.id) : -1
  const updateLayer = (layer: EditorLayer, patch: LayerPatch, groupKey?: string) => {
    dispatch({ type: 'update-layer', id: layer.id, patch }, groupKey ? { groupKey } : undefined)
  }
  const updateAdjustment = (descriptor: AdjustmentDescriptor, patch: Record<string, unknown>, groupKey?: string) => {
    if (selected?.type === 'adjustment') updateLayer(selected, { adjustment: { ...descriptor, ...patch } as AdjustmentDescriptor }, groupKey)
  }
  const updateLegacyAdjustment = (field: 'brightness' | 'contrast' | 'saturation' | 'hue' | 'blur', value: number, groupKey: string) => {
    if (selected?.type !== 'adjustment') return
    let adjustment = selected.adjustment
    if (adjustment?.type === 'brightness/contrast' && (field === 'brightness' || field === 'contrast')) {
      adjustment = { ...adjustment, [field]: value - 100 }
    } else if (adjustment?.type === 'hue/saturation' && (field === 'brightness' || field === 'saturation' || field === 'hue')) {
      const master = adjustment.master ?? { range: [0, 0, 0, 0], hue: 0, saturation: 0, lightness: 0 }
      adjustment = { ...adjustment, master: { ...master, [field === 'brightness' ? 'lightness' : field]: field === 'hue' ? value : value - 100 } }
    }
    updateLayer(selected, { [field]: value, adjustment }, groupKey)
  }
  const filters = normalizeLayerFilters(selected?.filters)
  const shapeStroke = selected?.type === 'shape' ? { ...defaultShapeStroke, ...selected.strokeStyle } : defaultShapeStroke
  const updateGradientFill = (patch: Partial<GradientShapeFill>, groupKey?: string) => {
    if (selected?.type === 'shape' && selected.fillStyle?.type === 'gradient') updateLayer(selected, { fillStyle: { ...selected.fillStyle, ...patch } }, groupKey)
  }
  const updatePatternFill = (patch: Partial<PatternShapeFill>, groupKey?: string) => {
    if (selected?.type === 'shape' && selected.fillStyle?.type === 'pattern') updateLayer(selected, { fillStyle: { ...selected.fillStyle, ...patch } }, groupKey)
  }
  const updateSmartFilters = (smartFilters: Extract<EditorLayer, { type: 'smart-object' }>['smartFilters']) => {
    if (selected?.type === 'smart-object') updateLayer(selected, { smartFilters })
  }
  const addSmartFilter = (kind: 'blur' | 'sharpen' | 'invert') => {
    if (selected?.type !== 'smart-object') return
    const settings = { ...defaultLayerFilters, ...(kind === 'blur' ? { blur: 8 } : kind === 'sharpen' ? { contrast: 125 } : { invert: 100 }) }
    updateSmartFilters([...selected.smartFilters, { id: createId(), name: kind === 'blur' ? 'Gaussian Blur' : kind === 'sharpen' ? 'Sharpen' : 'Invert', visible: true, opacity: 100, blendMode: 'normal', settings, descriptor: { type: kind } }])
  }

  return (
    <aside style={{ '--panel-width': `${width}px` } as CSSProperties} onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-studio-panel')) event.preventDefault() }} onDrop={(event) => { if (event.dataTransfer.getData('application/x-studio-panel') === 'layers') onSwapPanels() }} className={`relative order-2 flex w-full shrink-0 flex-col border-t border-white/[0.07] bg-[#111113] lg:h-[calc(100vh-48px)] lg:border-t-0 ${collapsed ? 'lg:w-10' : 'lg:w-[var(--panel-width)]'} ${dockSide === 'left' ? 'lg:order-1 lg:border-r' : 'lg:order-3 lg:border-l'}`}>
      {collapsed ? <CollapsedPanelRail dockSide={dockSide} label="Properties" onClick={onToggleCollapsed} /> : <>
      <PanelResizeHandle dockSide={dockSide} width={width} onChange={onWidthChange} label="Properties panel" />
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div draggable onDragStart={(event: DragEvent) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-studio-panel', 'properties') }} className="flex h-14 shrink-0 cursor-grab items-center justify-between border-b border-white/[0.07] px-5 active:cursor-grabbing">
        <div>
          <h1 className="flex items-center gap-2 text-sm font-semibold text-zinc-100"><span className="text-[10px] tracking-[-2px] text-zinc-700">⠿</span>Properties</h1>
          <p className="mt-0.5 max-w-44 truncate text-[11px] text-zinc-600">{selectedGroup?.name ?? (document.selectedLayerIds.length > 1 ? `${document.selectedLayerIds.length} layers selected` : selected?.name ?? 'Document settings')}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => dispatch({ type: 'reset-document' })}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
          >
            <ResetIcon className="size-3.5" /> Reset
          </button>
          <PanelCollapseButton dockSide={dockSide} label="Properties" onClick={onToggleCollapsed} />
        </div>
      </div>

      {selectedGroup ? (
        <>
          <ControlSection title="Layer group">
            <label className="block">
              <span className="mb-2 block text-[11px] font-medium text-zinc-500">Name</span>
              <input className={fieldClass} value={selectedGroup.name} onChange={(event) => dispatch({ type: 'update-group', id: selectedGroup.id, patch: { name: event.target.value } }, { groupKey: `group-name-${selectedGroup.id}` })} onBlur={endHistoryGroup} />
            </label>
            <label className="mt-3 block">
              <span className="mb-2 block text-[11px] font-medium text-zinc-500">Blend mode</span>
              <select aria-label="Group blend mode" value={selectedGroup.blendMode} onChange={(event) => dispatch({ type: 'update-group', id: selectedGroup.id, patch: { blendMode: event.target.value as BlendMode } })} className={fieldClass}>{blendModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select>
            </label>
            <button type="button" aria-pressed={selectedGroup.passThrough === true} onClick={() => dispatch({ type: 'update-group', id: selectedGroup.id, patch: { passThrough: !selectedGroup.passThrough } })} className={`mt-3 w-full rounded-lg border px-3 py-2 text-left text-xs ${selectedGroup.passThrough ? 'border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-100' : 'border-white/[0.08] text-zinc-500'}`}><span className="block font-medium">{selectedGroup.passThrough ? 'Pass through' : 'Isolated group'}</span><span className="mt-0.5 block text-[9px] text-zinc-600">{selectedGroup.passThrough ? 'Child blend modes interact with layers below.' : 'Children composite before the group blend mode.'}</span></button>
            <RangeControl label="Group opacity" value={selectedGroup.opacity} min={0} max={100} suffix="%" onChange={(value) => dispatch({ type: 'update-group', id: selectedGroup.id, patch: { opacity: value } }, { groupKey: `group-opacity-${selectedGroup.id}` })} onChangeEnd={endHistoryGroup} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => dispatch({ type: 'update-group', id: selectedGroup.id, patch: { visible: !selectedGroup.visible } })} className={`rounded-lg border px-3 py-2 text-xs ${selectedGroup.visible ? 'border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-100' : 'border-white/[0.08] text-zinc-600'}`}>{selectedGroup.visible ? 'Visible' : 'Hidden'}</button>
              <button type="button" onClick={() => dispatch({ type: 'update-group', id: selectedGroup.id, patch: { locked: !selectedGroup.locked } })} className={`rounded-lg border px-3 py-2 text-xs ${selectedGroup.locked ? 'border-amber-300/20 bg-amber-300/[0.06] text-amber-100' : 'border-white/[0.08] text-zinc-600'}`}>{selectedGroup.locked ? 'Locked' : 'Unlocked'}</button>
            </div>
          </ControlSection>
          <ControlSection title="Folder contents"><p className="text-xs leading-6 text-zinc-500">{getDescendantLayers(document, selectedGroup.id).length} layers and {getStackChildren(document, selectedGroup.id).filter((item) => item.type === 'group').length} nested folders are composited together before the folder opacity and blend mode are applied.</p></ControlSection>
          <button type="button" onClick={() => dispatch({ type: 'select-group', id: null }, { record: false })} className="mx-5 my-4 rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200">Back to document settings</button>
        </>
      ) : !selected ? (
        <>
          <ControlSection title="Canvas">
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-black/30 p-1">
              {canvasPresets.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  title={preset.label}
                  aria-pressed={document.canvasPreset === preset.id}
                  onClick={() => dispatch({ type: 'set-canvas-preset', value: preset.id })}
                  className={`rounded-md py-2 text-[10px] font-semibold transition focus-visible:outline-2 focus-visible:outline-violet-400 ${document.canvasPreset === preset.id ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-600 hover:text-zinc-300'}`}
                >{preset.shortLabel}</button>
              ))}
            </div>
          </ControlSection>

          <ControlSection title="Background">
            <div className="mb-4 grid grid-cols-4 rounded-lg bg-black/30 p-1">
              {(['gradient', 'solid', 'transparent', 'image'] as const).map((kind) => (
                <button
                  type="button"
                  key={kind}
                  aria-pressed={document.background.kind === kind}
                  className={tabClass(document.background.kind === kind)}
                  onClick={() => kind === 'image' && !document.background.imageAssetId ? onBackgroundImage() : dispatch({ type: 'set-background', patch: { kind } })}
                >{kind[0].toUpperCase() + kind.slice(1)}</button>
              ))}
            </div>

            {document.background.kind === 'gradient' && (
              <>
                <div className="grid grid-cols-6 gap-2">
                  {backgroundPresets.map((preset) => {
                    const active = preset.colors[0] === document.background.gradient[0] && preset.colors[1] === document.background.gradient[1]
                    return (
                      <button
                        type="button"
                        key={preset.id}
                        title={preset.name}
                        aria-label={`${preset.name} gradient`}
                        aria-pressed={active}
                        onClick={() => dispatch({ type: 'set-background', patch: { gradient: [...preset.colors], kind: 'gradient' } })}
                        className={`aspect-square rounded-lg border transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ${active ? 'border-white ring-2 ring-white/20' : 'border-white/10'}`}
                        style={{ backgroundImage: `linear-gradient(135deg, ${preset.colors[0]}, ${preset.colors[1]})` }}
                      />
                    )
                  })}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  {document.background.gradient.map((color, index) => (
                    <label key={index} className="flex flex-1 items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] p-2 text-[10px] text-zinc-500">
                      <input
                        type="color"
                        value={color}
                        aria-label={`Gradient color ${index + 1}`}
                        className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
                        onChange={(event) => {
                          const colors = [...document.background.gradient] as [string, string]
                          colors[index] = event.target.value
                          dispatch({ type: 'set-background', patch: { gradient: colors } }, { groupKey: `gradient-${index}` })
                        }}
                        onBlur={endHistoryGroup}
                      />
                      {color.toUpperCase()}
                    </label>
                  ))}
                </div>
                <RangeControl label="Direction" value={document.background.gradientAngle} min={0} max={360} suffix="°" onChange={(value) => dispatch({ type: 'set-background', patch: { gradientAngle: value } }, { groupKey: 'gradient-angle' })} onChangeEnd={endHistoryGroup} />
              </>
            )}

            {document.background.kind === 'solid' && (
              <label className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
                <input type="color" value={document.background.solidColor} aria-label="Background color" className="size-8 cursor-pointer rounded-md border-0 bg-transparent p-0" onChange={(event) => dispatch({ type: 'set-background', patch: { solidColor: event.target.value } }, { groupKey: 'solid-color' })} onBlur={endHistoryGroup} />
                <span className="font-mono text-xs text-zinc-400">{document.background.solidColor.toUpperCase()}</span>
              </label>
            )}

            {document.background.kind === 'image' && (
              <div className="space-y-3">
                <button type="button" onClick={onBackgroundImage} className="flex w-full items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-left text-xs text-zinc-400 transition hover:bg-white/[0.06]">
                  <span className="flex size-8 items-center justify-center rounded-md bg-white/[0.05]"><ImageIcon className="size-4" /></span>
                  <span className="min-w-0 flex-1 truncate">{backgroundImageName ?? 'Choose background image'}</span>
                  <span className="text-[10px] text-zinc-600">Change</span>
                </button>
                <RangeControl label="Blur" value={document.background.imageBlur} min={0} max={40} suffix="px" onChange={(value) => dispatch({ type: 'set-background', patch: { imageBlur: value } }, { groupKey: 'background-blur' })} onChangeEnd={endHistoryGroup} />
                <RangeControl label="Darken" value={document.background.imageOverlay} min={0} max={80} suffix="%" onChange={(value) => dispatch({ type: 'set-background', patch: { imageOverlay: value } }, { groupKey: 'background-overlay' })} onChangeEnd={endHistoryGroup} />
              </div>
            )}
          </ControlSection>

          <ControlSection title="Pattern">
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-black/30 p-1">
              {(['none', 'grid', 'dots', 'waves'] as PatternKind[]).map((kind) => (
                <button key={kind} type="button" aria-pressed={document.pattern.kind === kind} onClick={() => dispatch({ type: 'set-pattern', patch: { kind } })} className={`rounded-md py-2 text-[10px] font-medium capitalize transition ${document.pattern.kind === kind ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-600 hover:text-zinc-300'}`}>{kind}</button>
              ))}
            </div>
            {document.pattern.kind !== 'none' && (
              <>
                <div className="mt-3 flex items-center gap-3">
                  <input type="color" aria-label="Pattern color" value={document.pattern.color} onChange={(event) => dispatch({ type: 'set-pattern', patch: { color: event.target.value } }, { groupKey: 'pattern-color' })} onBlur={endHistoryGroup} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" />
                  <span className="font-mono text-[10px] text-zinc-500">{document.pattern.color.toUpperCase()}</span>
                </div>
                <RangeControl label="Opacity" value={document.pattern.opacity} min={2} max={60} suffix="%" onChange={(value) => dispatch({ type: 'set-pattern', patch: { opacity: value } }, { groupKey: 'pattern-opacity' })} onChangeEnd={endHistoryGroup} />
                <RangeControl label="Spacing" value={document.pattern.size} min={16} max={100} suffix="px" onChange={(value) => dispatch({ type: 'set-pattern', patch: { size: value } }, { groupKey: 'pattern-size' })} onChangeEnd={endHistoryGroup} />
              </>
            )}
          </ControlSection>
        </>
      ) : (
        <>
          <ControlSection title="Layer">
            <label className="block">
              <span className="mb-2 block text-[11px] font-medium text-zinc-500">Name</span>
              <input className={fieldClass} value={selected.name} onChange={(event) => updateLayer(selected, { name: event.target.value }, `name-${selected.id}`)} onBlur={endHistoryGroup} />
            </label>
            <label className="mt-3 block">
              <span className="mb-2 block text-[11px] font-medium text-zinc-500">Blend mode</span>
              <select aria-label="Blend mode" value={selected.blendMode ?? 'normal'} onChange={(event) => updateLayer(selected, { blendMode: event.target.value as BlendMode })} className={fieldClass}>
                {blendModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
              </select>
            </label>
            {selected.type !== 'adjustment' && selectedIndex > 0 && (
              <button type="button" aria-pressed={Boolean(selected.clipToBelow)} onClick={() => updateLayer(selected, { clipToBelow: !selected.clipToBelow })} className={`mt-3 flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-xs transition ${selected.clipToBelow ? 'border-violet-400/30 bg-violet-400/10 text-violet-200' : 'border-white/[0.08] text-zinc-500 hover:text-zinc-200'}`}>
                <span>Clip to layer below</span><span className="text-sm">↳</span>
              </button>
            )}
            <RangeControl label="Opacity" value={selected.opacity} min={0} max={100} suffix="%" onChange={(value) => updateLayer(selected, { opacity: value }, `opacity-${selected.id}`)} onChangeEnd={endHistoryGroup} />
            <RangeControl label="Rotation" value={selected.rotation} min={-180} max={180} suffix="°" onChange={(value) => updateLayer(selected, { rotation: value }, `rotation-${selected.id}`)} onChangeEnd={endHistoryGroup} />
          </ControlSection>

          {selected.maskAssetId && <ControlSection title="Raster mask"><RangeControl label="Density" value={selected.maskSettings?.density ?? 100} min={0} max={100} suffix="%" onChange={(density) => updateLayer(selected, { maskSettings: { density, feather: selected.maskSettings?.feather ?? 0, linked: selected.maskSettings?.linked ?? true } }, `mask-density-${selected.id}`)} onChangeEnd={endHistoryGroup} /><RangeControl label="Feather" value={selected.maskSettings?.feather ?? 0} min={0} max={100} suffix="px" onChange={(feather) => updateLayer(selected, { maskSettings: { density: selected.maskSettings?.density ?? 100, feather, linked: selected.maskSettings?.linked ?? true } }, `mask-feather-${selected.id}`)} onChangeEnd={endHistoryGroup} /><button type="button" aria-pressed={selected.maskSettings?.linked ?? true} onClick={() => updateLayer(selected, { maskSettings: { density: selected.maskSettings?.density ?? 100, feather: selected.maskSettings?.feather ?? 0, linked: !(selected.maskSettings?.linked ?? true) } })} className={`mt-2 rounded-lg border px-3 py-2 text-xs ${selected.maskSettings?.linked ?? true ? 'border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-100' : 'border-white/[0.08] text-zinc-500'}`}>Link mask to layer</button></ControlSection>}

          {selected.vectorMask && <ControlSection title="Vector mask"><RangeControl label="Density" value={selected.vectorMask.density} min={0} max={100} suffix="%" onChange={(density) => updateLayer(selected, { vectorMask: { ...selected.vectorMask!, density } }, `vector-mask-density-${selected.id}`)} onChangeEnd={endHistoryGroup} /><RangeControl label="Feather" value={selected.vectorMask.feather} min={0} max={100} suffix="px" onChange={(feather) => updateLayer(selected, { vectorMask: { ...selected.vectorMask!, feather } }, `vector-mask-feather-${selected.id}`)} onChangeEnd={endHistoryGroup} /><button type="button" aria-pressed={selected.vectorMask.linked} onClick={() => updateLayer(selected, { vectorMask: { ...selected.vectorMask!, linked: !selected.vectorMask!.linked } })} className={`mt-2 rounded-lg border px-3 py-2 text-xs ${selected.vectorMask.linked ? 'border-violet-300/20 bg-violet-300/[0.06] text-violet-100' : 'border-white/[0.08] text-zinc-500'}`}>Link vector mask to layer</button></ControlSection>}

          {selected.type !== 'adjustment' && <ControlSection title="Layer filters">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] leading-relaxed text-zinc-600">Non-destructive layer filters</p>
              <button type="button" onClick={() => updateLayer(selected, { filters: defaultLayerFilters })} className="rounded px-2 py-1 text-[9px] text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300">Reset</button>
            </div>
            <RangeControl label="Brightness" value={filters.brightness} min={0} max={200} suffix="%" onChange={(value) => updateLayer(selected, { filters: { ...filters, brightness: value } }, `brightness-${selected.id}`)} onChangeEnd={endHistoryGroup} />
            <RangeControl label="Contrast" value={filters.contrast} min={0} max={200} suffix="%" onChange={(value) => updateLayer(selected, { filters: { ...filters, contrast: value } }, `contrast-${selected.id}`)} onChangeEnd={endHistoryGroup} />
            <RangeControl label="Saturation" value={filters.saturation} min={0} max={200} suffix="%" onChange={(value) => updateLayer(selected, { filters: { ...filters, saturation: value } }, `saturation-${selected.id}`)} onChangeEnd={endHistoryGroup} />
            <RangeControl label="Hue" value={filters.hue} min={-180} max={180} suffix="°" onChange={(value) => updateLayer(selected, { filters: { ...filters, hue: value } }, `hue-${selected.id}`)} onChangeEnd={endHistoryGroup} />
            <RangeControl label="Grayscale" value={filters.grayscale} min={0} max={100} suffix="%" onChange={(value) => updateLayer(selected, { filters: { ...filters, grayscale: value } }, `grayscale-${selected.id}`)} onChangeEnd={endHistoryGroup} />
            <RangeControl label="Sepia" value={filters.sepia} min={0} max={100} suffix="%" onChange={(value) => updateLayer(selected, { filters: { ...filters, sepia: value } }, `sepia-${selected.id}`)} onChangeEnd={endHistoryGroup} />
            <RangeControl label="Invert" value={filters.invert} min={0} max={100} suffix="%" onChange={(value) => updateLayer(selected, { filters: { ...filters, invert: value } }, `invert-${selected.id}`)} onChangeEnd={endHistoryGroup} />
            <RangeControl label="Blur" value={filters.blur} min={0} max={40} suffix="px" onChange={(value) => updateLayer(selected, { filters: { ...filters, blur: value } }, `filter-blur-${selected.id}`)} onChangeEnd={endHistoryGroup} />
          </ControlSection>}

          {selected.type !== 'adjustment' && <LayerEffectsControl layer={selected} onUpdate={(patch, groupKey) => updateLayer(selected, patch, groupKey)} onChangeEnd={endHistoryGroup} />}

          {selected.type === 'adjustment' && (
            <ControlSection title="Adjustment layer">
              <div className="mb-2 rounded-lg border border-cyan-300/10 bg-cyan-300/[0.04] p-3 text-[10px] leading-relaxed text-cyan-100/60">Affects the complete visible stack beneath this layer without changing its pixels.</div>
              <label className="mb-3 block">
                <span className="mb-2 block text-[11px] font-medium text-zinc-500">Adjustment type</span>
                <select aria-label="Adjustment type" value={selected.adjustment?.type ?? 'brightness/contrast'} onChange={(event) => updateLayer(selected, { adjustment: createAdjustmentDescriptor(event.target.value as Parameters<typeof createAdjustmentDescriptor>[0]) })} className={fieldClass}>
                  {adjustmentKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                </select>
              </label>
              {selected.adjustment && <div className="mb-3 rounded-lg border border-white/[0.06] bg-black/15 p-3 text-[10px] text-zinc-500">Typed, PSD-safe {selected.adjustment.type} properties are preserved in Studio projects and layered PSD exports.</div>}
              {selected.adjustment?.type === 'exposure' && <>
                <RangeControl label="Exposure" value={selected.adjustment.exposure} min={-5} max={5} step={0.05} onChange={(exposure) => updateAdjustment(selected.adjustment!, { exposure }, `adjustment-exposure-${selected.id}`)} onChangeEnd={endHistoryGroup} />
                <RangeControl label="Gamma" value={selected.adjustment.gamma} min={0.1} max={3} step={0.05} onChange={(gamma) => updateAdjustment(selected.adjustment!, { gamma }, `adjustment-gamma-${selected.id}`)} onChangeEnd={endHistoryGroup} />
              </>}
              {selected.adjustment?.type === 'vibrance' && <>
                <RangeControl label="Vibrance" value={selected.adjustment.vibrance} min={-100} max={100} suffix="%" onChange={(vibrance) => updateAdjustment(selected.adjustment!, { vibrance }, `adjustment-vibrance-${selected.id}`)} onChangeEnd={endHistoryGroup} />
                <RangeControl label="Saturation" value={selected.adjustment.saturation} min={-100} max={100} suffix="%" onChange={(saturation) => updateAdjustment(selected.adjustment!, { saturation }, `adjustment-advanced-saturation-${selected.id}`)} onChangeEnd={endHistoryGroup} />
              </>}
              {selected.adjustment?.type === 'posterize' && <RangeControl label="Levels" value={selected.adjustment.levels} min={2} max={255} onChange={(levels) => updateAdjustment(selected.adjustment!, { levels }, `adjustment-posterize-${selected.id}`)} onChangeEnd={endHistoryGroup} />}
              {selected.adjustment?.type === 'threshold' && <RangeControl label="Threshold" value={selected.adjustment.level} min={1} max={255} onChange={(level) => updateAdjustment(selected.adjustment!, { level }, `adjustment-threshold-${selected.id}`)} onChangeEnd={endHistoryGroup} />}
              {selected.adjustment?.type === 'photo filter' && <>
                <label className="mb-2 flex items-center justify-between text-[10px] text-zinc-500">Colour<input aria-label="Photo filter color" type="color" value={selected.adjustment.color} onChange={(event) => updateAdjustment(selected.adjustment!, { color: event.target.value }, `adjustment-photo-color-${selected.id}`)} onBlur={endHistoryGroup} /></label>
                <RangeControl label="Density" value={selected.adjustment.density} min={1} max={100} suffix="%" onChange={(density) => updateAdjustment(selected.adjustment!, { density }, `adjustment-photo-density-${selected.id}`)} onChangeEnd={endHistoryGroup} />
              </>}
              <RangeControl label="Brightness" value={selected.brightness} min={0} max={200} suffix="%" onChange={(value) => updateLegacyAdjustment('brightness', value, `adjustment-brightness-${selected.id}`)} onChangeEnd={endHistoryGroup} />
              <RangeControl label="Contrast" value={selected.contrast} min={0} max={200} suffix="%" onChange={(value) => updateLegacyAdjustment('contrast', value, `adjustment-contrast-${selected.id}`)} onChangeEnd={endHistoryGroup} />
              <RangeControl label="Saturation" value={selected.saturation} min={0} max={200} suffix="%" onChange={(value) => updateLegacyAdjustment('saturation', value, `adjustment-saturation-${selected.id}`)} onChangeEnd={endHistoryGroup} />
              <RangeControl label="Hue" value={selected.hue} min={-180} max={180} suffix="°" onChange={(value) => updateLegacyAdjustment('hue', value, `adjustment-hue-${selected.id}`)} onChangeEnd={endHistoryGroup} />
              <RangeControl label="Blur" value={selected.blur} min={0} max={40} suffix="px" onChange={(value) => updateLegacyAdjustment('blur', value, `adjustment-blur-${selected.id}`)} onChangeEnd={endHistoryGroup} />
              <button type="button" onClick={() => updateLayer(selected, { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, adjustment: selected.adjustment ? createAdjustmentDescriptor(selected.adjustment.type) : null })} className="mt-3 w-full rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200">Reset adjustment</button>
            </ControlSection>
          )}

          {selected.type === 'image' && (
            <ControlSection title="Image">
              <div className="mb-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => updateLayer(selected, { flipX: !selected.flipX })} className={`rounded-lg border px-3 py-2 text-xs transition ${selected.flipX ? 'border-violet-400/40 bg-violet-400/10 text-violet-200' : 'border-white/[0.08] text-zinc-500 hover:text-zinc-200'}`}>Flip horizontal</button>
                <button type="button" onClick={() => updateLayer(selected, { flipY: !selected.flipY })} className={`rounded-lg border px-3 py-2 text-xs transition ${selected.flipY ? 'border-violet-400/40 bg-violet-400/10 text-violet-200' : 'border-white/[0.08] text-zinc-500 hover:text-zinc-200'}`}>Flip vertical</button>
              </div>
              <RangeControl label="Padding" value={selected.padding} min={2} max={32} suffix="%" onChange={(value) => updateLayer(selected, { padding: value }, `padding-${selected.id}`)} onChangeEnd={endHistoryGroup} />
              <RangeControl label="Scale" value={selected.scale} min={20} max={180} suffix="%" onChange={(value) => updateLayer(selected, { scale: value }, `scale-${selected.id}`)} onChangeEnd={endHistoryGroup} />
              <RangeControl label="Corners" value={selected.cornerRadius} min={0} max={96} suffix="px" onChange={(value) => updateLayer(selected, { cornerRadius: value }, `corners-${selected.id}`)} onChangeEnd={endHistoryGroup} />
              <RangeControl label="Shadow" value={selected.shadow} min={0} max={100} onChange={(value) => updateLayer(selected, { shadow: value }, `shadow-${selected.id}`)} onChangeEnd={endHistoryGroup} />
            </ControlSection>
          )}

          {selected.type === 'raster' && (
            <ControlSection title="Raster layer">
              <div className="rounded-lg border border-violet-400/15 bg-violet-400/[0.06] p-3 text-[10px] leading-relaxed text-violet-200/70">Use the Brush or Eraser tool above the canvas to edit this layer’s pixels.</div>
              <RangeControl label="Scale" value={selected.scale} min={10} max={300} suffix="%" onChange={(value) => updateLayer(selected, { scale: value }, `scale-${selected.id}`)} onChangeEnd={endHistoryGroup} />
              <p className="mt-2 font-mono text-[9px] text-zinc-700">{selected.width} × {selected.height} px</p>
            </ControlSection>
          )}

          {selected.type === 'smart-object' && (
            <ControlSection title="Smart object">
              <div className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.05] p-3">
                <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold tracking-wide text-cyan-200 uppercase">{selected.source.kind}</span><span className="truncate font-mono text-[9px] text-zinc-600">{selected.source.fileName}</span></div>
                {selected.source.path && <p className="mt-2 truncate font-mono text-[9px] text-zinc-700" title={selected.source.path}>{selected.source.path}</p>}
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">Source pixels stay untouched while Studio renders this layer from its local preview.</p>
              </div>
              <RangeControl label="Scale" value={selected.scale} min={10} max={300} suffix="%" onChange={(value) => updateLayer(selected, { scale: value }, `scale-${selected.id}`)} onChangeEnd={endHistoryGroup} />
              {selected.transformMatrix && <div className="mt-3"><p className="mb-2 text-[9px] font-semibold tracking-[0.14em] text-zinc-600 uppercase">Source matrix</p><div className="grid grid-cols-3 gap-1.5">{selected.transformMatrix.map((value, index) => <label key={index} className="block"><span className="sr-only">Matrix {String.fromCharCode(65 + index)}</span><input type="number" step="0.01" value={Math.round(value * 1000) / 1000} onChange={(event) => { const transformMatrix = [...selected.transformMatrix!] as [number, number, number, number, number, number]; transformMatrix[index] = Number(event.target.value); updateLayer(selected, { transformMatrix }, `matrix-${selected.id}-${index}`) }} onBlur={endHistoryGroup} className="w-full rounded-md border border-white/[0.07] bg-black/25 px-2 py-1.5 font-mono text-[9px] text-zinc-400 outline-none focus:border-cyan-300/40" /></label>)}</div></div>}
              <div className="mt-4 border-t border-white/[0.06] pt-3"><div className="mb-2 flex items-center justify-between"><p className="text-[9px] font-semibold tracking-[0.14em] text-zinc-600 uppercase">Smart filters</p><div className="flex gap-1"><button type="button" onClick={() => addSmartFilter('blur')} className="rounded bg-white/[0.05] px-1.5 py-1 text-[8px] text-zinc-500 hover:text-zinc-200">+ Blur</button><button type="button" onClick={() => addSmartFilter('sharpen')} className="rounded bg-white/[0.05] px-1.5 py-1 text-[8px] text-zinc-500 hover:text-zinc-200">+ Sharp</button><button type="button" onClick={() => addSmartFilter('invert')} className="rounded bg-white/[0.05] px-1.5 py-1 text-[8px] text-zinc-500 hover:text-zinc-200">+ Invert</button></div></div>
                <div className="space-y-2">{selected.smartFilters.map((filter, index) => <div key={filter.id} className="rounded-lg border border-white/[0.07] bg-black/15 p-2"><div className="flex items-center gap-1.5"><button type="button" aria-label={filter.visible ? `Hide ${filter.name}` : `Show ${filter.name}`} onClick={() => updateSmartFilters(selected.smartFilters.map((candidate) => candidate.id === filter.id ? { ...candidate, visible: !candidate.visible } : candidate))} className={`size-5 rounded text-[9px] ${filter.visible ? 'text-cyan-200' : 'text-zinc-700'}`}>{filter.visible ? '●' : '○'}</button><span className="min-w-0 flex-1 truncate text-[10px] text-zinc-300">{filter.name}</span><button type="button" disabled={index === 0} onClick={() => { const next = [...selected.smartFilters]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; updateSmartFilters(next) }} className="text-[9px] text-zinc-600 disabled:text-zinc-800">↑</button><button type="button" disabled={index === selected.smartFilters.length - 1} onClick={() => { const next = [...selected.smartFilters]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; updateSmartFilters(next) }} className="text-[9px] text-zinc-600 disabled:text-zinc-800">↓</button><button type="button" aria-label={`Remove ${filter.name}`} onClick={() => updateSmartFilters(selected.smartFilters.filter((candidate) => candidate.id !== filter.id))} className="text-xs text-zinc-700 hover:text-red-300">×</button></div>
                  <div className="mt-2 grid grid-cols-2 gap-2"><select aria-label={`${filter.name} blend mode`} value={filter.blendMode} onChange={(event) => updateSmartFilters(selected.smartFilters.map((candidate) => candidate.id === filter.id ? { ...candidate, blendMode: event.target.value as BlendMode } : candidate))} className="rounded border border-white/[0.07] bg-zinc-900 px-1.5 py-1 text-[9px] text-zinc-500">{blendModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select><label className="flex items-center gap-1 text-[8px] text-zinc-600"><input aria-label={`${filter.name} opacity`} type="range" min="0" max="100" value={filter.opacity} onChange={(event) => updateSmartFilters(selected.smartFilters.map((candidate) => candidate.id === filter.id ? { ...candidate, opacity: Number(event.target.value) } : candidate))} className="min-w-0 flex-1" />{filter.opacity}%</label></div>
                  {filter.settings.blur > 0 && <RangeControl label="Radius" value={filter.settings.blur} min={0} max={100} suffix="px" onChange={(blur) => updateSmartFilters(selected.smartFilters.map((candidate) => candidate.id === filter.id ? { ...candidate, settings: { ...candidate.settings, blur } } : candidate))} onChangeEnd={endHistoryGroup} />}
                  {selected.maskAssetId && <button type="button" onClick={() => updateSmartFilters(selected.smartFilters.map((candidate) => candidate.id === filter.id ? { ...candidate, maskAssetId: candidate.maskAssetId ? null : selected.maskAssetId } : candidate))} className={`mt-2 rounded px-2 py-1 text-[8px] ${filter.maskAssetId ? 'bg-cyan-300/10 text-cyan-200' : 'bg-white/[0.04] text-zinc-600'}`}>{filter.maskAssetId ? 'Filter mask active' : 'Use layer mask'}</button>}
                </div>)}</div>
              </div>
              {selected.source.kind === 'embedded' && <button type="button" disabled={!selected.embeddedDocument} onClick={onOpenSmartObject} className="mt-3 w-full rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:text-zinc-700">Open contents</button>}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={selected.source.kind === 'linked' ? onRelinkSmartObject : onReplaceSmartObject} className="rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-100">{selected.source.kind === 'linked' ? 'Relink…' : 'Replace…'}</button>
                <button type="button" onClick={onExportSmartObject} className="rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-100">Export contents…</button>
              </div>
              <p className="mt-2 font-mono text-[9px] text-zinc-700">{selected.width} × {selected.height} px · {selected.smartFilters.length} smart filter{selected.smartFilters.length === 1 ? '' : 's'}</p>
            </ControlSection>
          )}

          {selected.type === 'text' && (
            <ControlSection title="Text">
              <label className="block">
                <span className="mb-2 block text-[11px] font-medium text-zinc-500">Content</span>
                <textarea className={`${fieldClass} min-h-24 resize-y leading-relaxed`} value={selected.text} onChange={(event) => updateLayer(selected, { text: event.target.value }, `text-${selected.id}`)} onBlur={endHistoryGroup} />
              </label>
              <div className="mt-3 flex gap-2">
                <select aria-label="Font family" value={selected.fontFamily ?? 'Inter'} onChange={(event) => updateLayer(selected, { fontFamily: event.target.value })} className={`${fieldClass} min-w-0 flex-1`}>
                  <option value="Inter">Inter</option>
                  <option value="Arial">Arial</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Courier New">Courier New</option>
                  {customFonts.map((font) => <option key={font.id} value={font.family}>{font.name}</option>)}
                </select>
                <button type="button" onClick={onLoadFont} className="rounded-lg border border-white/[0.08] px-3 text-[10px] text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200">Load…</button>
              </div>
              <div className="mt-3 flex gap-2">
                <label className="flex flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-[10px] text-zinc-500">
                  <input type="color" aria-label="Text color" value={selected.color} onChange={(event) => updateLayer(selected, { color: event.target.value }, `text-color-${selected.id}`)} onBlur={endHistoryGroup} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
                  {selected.color.toUpperCase()}
                </label>
                <select aria-label="Font weight" value={selected.fontWeight} onChange={(event) => updateLayer(selected, { fontWeight: Number(event.target.value) as 400 | 600 | 700 })} className={`${fieldClass} w-24`}>
                  <option value="400">Regular</option><option value="600">Semibold</option><option value="700">Bold</option>
                </select>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-black/30 p-1">
                {(['left', 'center', 'right'] as const).map((align) => <button type="button" key={align} onClick={() => updateLayer(selected, { textAlign: align })} className={`rounded-md py-2 text-[10px] capitalize ${selected.textAlign === align ? 'bg-zinc-700 text-white' : 'text-zinc-600'}`}>{align}</button>)}
              </div>
              <RangeControl label="Size" value={selected.fontSize} min={18} max={180} suffix="px" onChange={(value) => updateLayer(selected, { fontSize: value }, `font-size-${selected.id}`)} onChangeEnd={endHistoryGroup} />
              <RangeControl label="Tracking" value={selected.letterSpacing} min={-4} max={24} suffix="px" onChange={(value) => updateLayer(selected, { letterSpacing: value }, `tracking-${selected.id}`)} onChangeEnd={endHistoryGroup} />
            </ControlSection>
          )}

          {selected.type === 'shape' && (
            <ControlSection title="Shape">
              <div className="grid grid-cols-2 gap-2">
                <label className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-[10px] text-zinc-500">Fill<input type="color" aria-label="Shape fill" value={/^#[0-9a-f]{6}$/i.test(selected.fill) ? selected.fill : '#000000'} onChange={(event) => updateLayer(selected, { fill: event.target.value, fillStyle: selected.fillStyle?.type === 'color' ? { type: 'color', color: event.target.value } : selected.fillStyle }, `fill-${selected.id}`)} onBlur={endHistoryGroup} className="mt-2 h-7 w-full cursor-pointer rounded border-0 bg-transparent p-0" /></label>
                <label className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-[10px] text-zinc-500">Stroke<input type="color" aria-label="Shape stroke" value={selected.stroke} onChange={(event) => updateLayer(selected, { stroke: event.target.value }, `stroke-${selected.id}`)} onBlur={endHistoryGroup} className="mt-2 h-7 w-full cursor-pointer rounded border-0 bg-transparent p-0" /></label>
              </div>
              <label className="mt-3 block"><span className="mb-2 block text-[10px] text-zinc-500">Fill type</span><select aria-label="Shape fill type" value={selected.fillStyle?.type ?? 'color'} onChange={(event) => { const type = event.target.value; updateLayer(selected, { fillStyle: type === 'gradient' ? { type: 'gradient', name: 'Foreground to stroke', style: 'linear', angle: 0, scale: 100, colorStops: [{ color: selected.fill === 'transparent' ? '#000000' : selected.fill, position: 0 }, { color: selected.stroke, position: 1 }], opacityStops: [{ opacity: 1, position: 0 }, { opacity: 1, position: 1 }] } : type === 'pattern' ? { type: 'pattern', id: 'diagonal', name: 'Diagonal', scale: 100, linked: true, phase: { x: 0, y: 0 } } : { type: 'color', color: selected.fill === 'transparent' ? '#000000' : selected.fill } }) }} className={fieldClass}><option value="color">Solid colour</option><option value="gradient">Gradient</option><option value="pattern">Pattern</option></select></label>
              {selected.fillStyle?.type === 'gradient' && <><label className="mt-3 block"><span className="mb-2 block text-[10px] text-zinc-500">Gradient style</span><select aria-label="Gradient style" value={selected.fillStyle.style} onChange={(event) => updateGradientFill({ style: event.target.value as GradientShapeFill['style'] })} className={fieldClass}><option value="linear">Linear</option><option value="radial">Radial</option><option value="angle">Angle</option><option value="reflected">Reflected</option><option value="diamond">Diamond</option></select></label><RangeControl label="Gradient angle" value={selected.fillStyle.angle} min={-180} max={180} suffix="°" onChange={(angle) => updateGradientFill({ angle }, `shape-gradient-${selected.id}`)} onChangeEnd={endHistoryGroup} /></>}
              {selected.fillStyle?.type === 'pattern' && <><label className="mt-3 block"><span className="mb-2 block text-[10px] text-zinc-500">Pattern</span><select aria-label="Shape pattern" value={selected.fillStyle.id} onChange={(event) => updatePatternFill({ id: event.target.value, name: event.target.selectedOptions[0].text })} className={fieldClass}><option value="diagonal">Diagonal</option><option value="dots">Dots</option><option value="grid">Grid</option></select></label><RangeControl label="Pattern scale" value={selected.fillStyle.scale} min={20} max={300} suffix="%" onChange={(scale) => updatePatternFill({ scale }, `shape-pattern-${selected.id}`)} onChangeEnd={endHistoryGroup} /></>}
              <RangeControl label="Width" value={selected.width} min={4} max={100} suffix="%" onChange={(value) => updateLayer(selected, { width: value }, `width-${selected.id}`)} onChangeEnd={endHistoryGroup} />
              <RangeControl label="Height" value={selected.height} min={4} max={100} suffix="%" onChange={(value) => updateLayer(selected, { height: value }, `height-${selected.id}`)} onChangeEnd={endHistoryGroup} />
              {selected.shape === 'rectangle' && <RangeControl label="Corners" value={selected.cornerRadius} min={0} max={100} suffix="px" onChange={(value) => updateLayer(selected, { cornerRadius: value }, `shape-corners-${selected.id}`)} onChangeEnd={endHistoryGroup} />}
              <RangeControl label="Stroke" value={selected.strokeWidth} min={0} max={24} suffix="px" onChange={(value) => updateLayer(selected, { strokeWidth: value }, `stroke-width-${selected.id}`)} onChangeEnd={endHistoryGroup} />
              {selected.strokeWidth > 0 && <><div className="mt-3 grid grid-cols-3 gap-1">{(['inside', 'center', 'outside'] as const).map((alignment) => <button key={alignment} type="button" aria-pressed={shapeStroke.alignment === alignment} onClick={() => updateLayer(selected, { strokeStyle: { ...shapeStroke, alignment } })} className={`rounded-md py-2 text-[9px] capitalize ${shapeStroke.alignment === alignment ? 'bg-violet-400/15 text-violet-200' : 'bg-white/[0.03] text-zinc-600'}`}>{alignment}</button>)}</div><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[9px] text-zinc-600">Cap<select aria-label="Stroke cap" value={shapeStroke.cap} onChange={(event) => updateLayer(selected, { strokeStyle: { ...shapeStroke, cap: event.target.value as typeof shapeStroke.cap } })} className={`${fieldClass} mt-1`}><option value="butt">Butt</option><option value="round">Round</option><option value="square">Square</option></select></label><label className="text-[9px] text-zinc-600">Join<select aria-label="Stroke join" value={shapeStroke.join} onChange={(event) => updateLayer(selected, { strokeStyle: { ...shapeStroke, join: event.target.value as typeof shapeStroke.join } })} className={`${fieldClass} mt-1`}><option value="miter">Miter</option><option value="round">Round</option><option value="bevel">Bevel</option></select></label></div><label className="mt-2 block text-[9px] text-zinc-600">Dash preset<select aria-label="Stroke dash preset" value={shapeStroke.dashes.join(',')} onChange={(event) => updateLayer(selected, { strokeStyle: { ...shapeStroke, dashes: event.target.value ? event.target.value.split(',').map(Number) : [] } })} className={`${fieldClass} mt-1`}><option value="">Solid</option><option value="8,4">Dashed</option><option value="2,4">Dotted</option><option value="12,4,2,4">Dash dot</option></select></label></>}
            </ControlSection>
          )}

          <button type="button" onClick={() => dispatch({ type: 'select-layer', id: null }, { record: false })} className="mx-5 my-4 rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200">Back to document settings</button>
        </>
      )}
      </div>
      </>}
    </aside>
  )
}
