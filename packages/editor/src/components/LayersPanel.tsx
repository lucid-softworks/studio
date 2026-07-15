import type { EditorDispatch, EditorDocument, EditorLayer } from '../editor/types'
import { CircleIcon, EyeIcon, ImageIcon, LockIcon, RectangleIcon, TextIcon, TrashIcon } from './Icons'

type LayersPanelProps = {
  document: EditorDocument
  dispatch: EditorDispatch
  onAddLayer: () => void
  onAddAdjustment: () => void
  editingMaskLayerId: string | null
  onAddMask: (layerId: string) => void
  onEditMask: (layerId: string) => void
  onRemoveMask: (layerId: string) => void
}

function LayerTypeIcon({ layer }: { layer: EditorLayer }) {
  if (layer.type === 'image' || layer.type === 'raster') return <ImageIcon className="size-3.5" />
  if (layer.type === 'text') return <TextIcon className="size-3.5" />
  if (layer.type === 'adjustment') return <CircleIcon className="size-3.5" />
  return layer.shape === 'ellipse' ? <CircleIcon className="size-3.5" /> : <RectangleIcon className="size-3.5" />
}

export function LayersPanel({ document, dispatch, onAddLayer, onAddAdjustment, editingMaskLayerId, onAddMask, onEditMask, onRemoveMask }: LayersPanelProps) {
  const activeLayer = document.layers.find((layer) => layer.id === document.selectedLayerId)
  return (
    <aside className="order-3 flex w-full shrink-0 flex-col border-t border-white/[0.07] bg-[#111113] lg:h-[calc(100vh-65px)] lg:w-[258px] lg:border-t-0 lg:border-l">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Layers</h2>
          <p className="mt-0.5 text-[10px] text-zinc-600">{document.layers.length} object{document.layers.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" title="New adjustment layer" aria-label="New adjustment layer" onClick={onAddAdjustment} className="flex size-7 items-center justify-center rounded-md text-sm text-zinc-600 transition hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-violet-400">◐</button>
          <button type="button" title="New empty raster layer" aria-label="New layer" onClick={onAddLayer} className="flex size-7 items-center justify-center rounded-md text-lg font-light text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-violet-400">+</button>
        </div>
      </div>

      <div className="min-h-44 flex-1 space-y-1 overflow-y-auto p-2">
        {[...document.layers].reverse().map((layer, displayIndex) => {
          const selected = document.selectedLayerIds.includes(layer.id)
          const active = layer.id === document.selectedLayerId
          const actualIndex = document.layers.length - 1 - displayIndex
          return (
            <div
              key={layer.id}
              className={`group flex w-full items-center rounded-lg border p-1 transition ${
                selected
                  ? 'border-violet-400/25 bg-violet-400/10 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
              }`}
            >
              <button
                type="button"
                onClick={(event) => dispatch({ type: 'select-layer', id: layer.id, mode: event.shiftKey || event.metaKey || event.ctrlKey ? 'toggle' : 'replace' }, { record: false })}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left focus-visible:outline-2 focus-visible:outline-violet-400"
              >
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-md ${active ? 'bg-violet-400/20 text-violet-200 ring-1 ring-violet-300/30' : selected ? 'bg-violet-400/10 text-violet-400' : 'bg-white/[0.04]'}`}>
                  <LayerTypeIcon layer={layer} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{layer.clipToBelow && <span className="mr-1 text-violet-300/60">↳</span>}{layer.name}</span>
                  <span className="block text-[9px] tracking-wide text-zinc-700 uppercase">{layer.type}</span>
                </span>
                {!layer.visible && <span className="size-1.5 rounded-full bg-zinc-700" />}
              </button>
              <div className={`flex shrink-0 items-center ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
                {layer.maskAssetId && <button type="button" aria-label={editingMaskLayerId === layer.id ? 'Edit layer pixels' : 'Edit layer mask'} title={editingMaskLayerId === layer.id ? 'Return to layer pixels' : 'Edit layer mask'} onClick={() => onEditMask(layer.id)} className={`flex size-6 items-center justify-center rounded text-[8px] font-bold ${editingMaskLayerId === layer.id ? 'bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-300/25' : 'text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300'}`}>M</button>}
                <button
                  type="button"
                  aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                  onClick={() => dispatch({ type: 'update-layer', id: layer.id, patch: { visible: !layer.visible } })}
                  className="flex size-6 items-center justify-center rounded text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300"
                >
                  <EyeIcon className="size-3.5" closed={!layer.visible} />
                </button>
                <button
                  type="button"
                  aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
                  title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                  onClick={() => dispatch({ type: 'update-layer', id: layer.id, patch: { locked: !layer.locked } })}
                  className="flex size-6 items-center justify-center rounded text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300"
                >
                  <LockIcon className="size-3.5" locked={layer.locked} />
                </button>
                {active && <>
                  <button type="button" aria-label="Move layer up" disabled={actualIndex === document.layers.length - 1} onClick={() => dispatch({ type: 'move-layer', id: layer.id, direction: 'up' })} className="flex size-5 items-center justify-center rounded text-[10px] text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300 disabled:opacity-20">↑</button>
                  <button type="button" aria-label="Move layer down" disabled={actualIndex === 0} onClick={() => dispatch({ type: 'move-layer', id: layer.id, direction: 'down' })} className="flex size-5 items-center justify-center rounded text-[10px] text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300 disabled:opacity-20">↓</button>
                </>}
              </div>
            </div>
          )
        })}

        {document.layers.length === 0 && (
          <div className="flex min-h-40 flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-white/[0.04] text-zinc-700"><ImageIcon /></span>
            <p className="text-xs font-medium text-zinc-500">Blank document</p>
            <p className="mt-1 text-[10px] leading-relaxed text-zinc-700">Press + to create an empty raster layer.</p>
          </div>
        )}
      </div>

      {document.selectedLayerIds.length > 0 && (
        <div className="flex items-center justify-between border-t border-white/[0.07] p-3">
          <div className="flex items-center gap-1">
            {document.selectedLayerIds.length === 1 && activeLayer && activeLayer.type !== 'adjustment' && (
              <>
                <button type="button" onClick={() => activeLayer.maskAssetId ? onEditMask(activeLayer.id) : onAddMask(activeLayer.id)} className={`rounded-md border px-2 py-1 text-[9px] font-medium ${editingMaskLayerId === activeLayer.id ? 'border-cyan-300/20 bg-cyan-400/10 text-cyan-200' : 'border-white/[0.07] text-zinc-600 hover:text-zinc-300'}`}>{activeLayer.maskAssetId ? editingMaskLayerId === activeLayer.id ? 'Pixels' : 'Mask' : '+ Mask'}</button>
                {activeLayer.maskAssetId && <button type="button" aria-label="Remove layer mask" title="Remove layer mask" onClick={() => onRemoveMask(activeLayer.id)} className="flex size-6 items-center justify-center rounded text-[11px] text-zinc-700 hover:bg-red-400/10 hover:text-red-300">×</button>}
              </>
            )}
            {document.selectedLayerIds.length > 1 && <p className="text-[10px] text-zinc-700">{document.selectedLayerIds.length} selected</p>}
          </div>
          <button
            type="button"
            aria-label="Delete selected layer"
            onClick={() => dispatch({ type: 'remove-layers', ids: document.selectedLayerIds })}
            className="flex size-7 items-center justify-center rounded-md text-zinc-600 transition hover:bg-red-400/10 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-red-400"
          >
            <TrashIcon className="size-3.5" />
          </button>
        </div>
      )}
    </aside>
  )
}
