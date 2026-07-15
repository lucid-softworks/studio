export function PanelCollapseButton({ dockSide, label, onClick }: {
  dockSide: 'left' | 'right'
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" aria-label={`Collapse ${label}`} title={`Collapse ${label}`} onClick={onClick} className="flex size-7 items-center justify-center rounded-md text-sm text-zinc-600 transition hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-violet-400">
      <span aria-hidden="true">{dockSide === 'left' ? '‹' : '›'}</span>
    </button>
  )
}

export function CollapsedPanelRail({ dockSide, label, onClick }: {
  dockSide: 'left' | 'right'
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" aria-label={`Expand ${label}`} title={`Expand ${label}`} onClick={onClick} className="flex h-10 w-full items-center justify-center gap-2 text-zinc-600 transition hover:bg-white/[0.04] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-violet-400 lg:h-full lg:flex-col lg:py-3">
      <span aria-hidden="true" className="text-sm">{dockSide === 'left' ? '›' : '‹'}</span>
      <span className="text-[9px] font-semibold tracking-[0.14em] uppercase lg:[writing-mode:vertical-rl]">{label}</span>
    </button>
  )
}
