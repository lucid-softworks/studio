import type { ReactNode } from 'react'
import { CircleIcon, RectangleIcon, TextIcon } from './Icons'

export type EditorTool =
  | 'move'
  | 'marquee'
  | 'ellipse-select'
  | 'single-row-select'
  | 'single-column-select'
  | 'lasso'
  | 'polygonal-lasso'
  | 'magnetic-lasso'
  | 'magic-wand'
  | 'object-select'
  | 'crop'
  | 'perspective-crop'
  | 'eyedropper'
  | 'measure'
  | 'healing'
  | 'clone-stamp'
  | 'brush'
  | 'eraser'
  | 'fill'
  | 'gradient'
  | 'dodge'
  | 'burn'
  | 'text'
  | 'pen'
  | 'direct-select'
  | 'path-select'
  | 'warp'
  | 'puppet-warp'
  | 'rectangle'
  | 'ellipse'
  | 'hand'
  | 'zoom'

type IconProps = { className?: string }

function MoveToolIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 3.5l12.5 8-6 1.5-3 5.5L5 3.5z" /><path strokeLinecap="round" d="M13.2 13.4l4.3 5.1" /></svg>
}

function MarqueeToolIcon({ className, ellipse = false }: IconProps & { ellipse?: boolean }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.4 2.4" aria-hidden="true">{ellipse ? <ellipse cx="12" cy="12" rx="8" ry="6.5" /> : <rect x="4" y="5" width="16" height="14" rx="1" />}</svg>
}

function EyedropperToolIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M14.5 5.5l4-2 2 2-2 4-9.8 9.8-4 .7.7-4 9.1-10.5z" /><path strokeLinecap="round" d="M12.5 7.5l4 4M5.5 16.2l2.3 2.3" /></svg>
}

function MeasureToolIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16.5L16.5 4 20 7.5 7.5 20 4 16.5z" /><path strokeLinecap="round" d="M8 14l2 2m.5-5.5l2 2M13 8l2 2" /></svg>
}

function LassoToolIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M20 10.5c0 3.6-3.8 6.5-8.5 6.5S3 14.1 3 10.5 6.8 4 11.5 4 20 6.9 20 10.5z" /><path strokeLinecap="round" d="M11.5 17c1.1 1.8.4 3.3-2.2 3.3-2 0-3.3-.8-3.8-1.8" /></svg>
}

function WandToolIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path strokeLinecap="round" d="M5 19L16.5 7.5M4 4v3M2.5 5.5h3M18.5 14v4M16.5 16h4M15.5 2.5v3M14 4h3" /><path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.7l2.6 2.6" /></svg>
}

function ObjectSelectToolIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path strokeDasharray="2.5 2.5" d="M4 5h16v14H4z" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 8l8 5-4 1-2 3-2-9z" /></svg>
}

function CropToolIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path strokeLinecap="round" d="M7 3v14h14M3 7h14v14" /></svg>
}

function HealingToolIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 8.5l3.5-3.5a4.2 4.2 0 016 0l4.5 4.5a4.2 4.2 0 010 6L15.5 19a4.2 4.2 0 01-6 0L5 14.5a4.2 4.2 0 010-6z" /><path strokeLinecap="round" d="M8 8l8 8M8.5 12h3M10 10.5v3M13 15h3M14.5 13.5v3" /></svg>
}

function CloneToolIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M8 4h8l1 5-2.5 2v3H20v5H4v-5h5.5v-3L7 9l1-5z" /><path strokeLinecap="round" d="M6 16h12" /></svg>
}

function FillToolIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l7-7 7 7-7 7-7-7zM9 5l2-2 2 2" /><path strokeLinecap="round" d="M3 21h18M18.5 17.5c0-1 1.5-3 1.5-3s1.5 2 1.5 3a1.5 1.5 0 01-3 0z" /></svg>
}

function GradientToolIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="M4 6h8v12H4z" fill="currentColor" stroke="none" opacity=".85" /><path d="M12 6h4v12h-4z" fill="currentColor" stroke="none" opacity=".45" /></svg>
}

function ToneToolIcon({ className, burn = false }: IconProps & { burn?: boolean }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill={burn ? 'currentColor' : 'none'} /><path strokeLinecap="round" d={burn ? 'M9 12h6' : 'M9 12h6M12 9v6'} stroke={burn ? '#111113' : 'currentColor'} /></svg>
}

function BrushToolIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M14.5 4.5l5 5-9 9a4.2 4.2 0 01-6 0 4.2 4.2 0 010-6l10-8z" /><path strokeLinecap="round" d="M5 19.5c-1.2.8-2.2.9-3 .5.6-.6 1-1.5 1-2.8" /></svg>
}

function EraserToolIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M14.7 4.5l4.8 4.8-9.2 9.2H6.5l-3-3 11.2-11z" /><path strokeLinecap="round" d="M10.5 18.5H21M8.8 9.8l5.4 5.4" /></svg>
}

function HandToolIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 11V6.7a1.5 1.5 0 013 0V10 5.5a1.5 1.5 0 013 0V10 6.5a1.5 1.5 0 013 0v4-2a1.5 1.5 0 013 0v4.7c0 4.4-2.7 7.3-7 7.3h-.7c-2.2 0-3.8-.8-5.1-2.5L3.9 14a1.6 1.6 0 012.4-2.1l1.2 1.2V11z" /></svg>
}

function ZoomToolIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path strokeLinecap="round" d="M15.5 15.5L21 21M7.5 10.5h6M10.5 7.5v6" /></svg>
}

function PenToolIcon({ className, selection = false }: IconProps & { selection?: boolean }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">{selection ? <><path strokeLinecap="round" strokeLinejoin="round" d="M5 3.5l12.5 8-5.2 1.3-2.8 5.4L5 3.5z" /><circle cx="18.5" cy="18.5" r="2" /></> : <><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l6.5 6.5L12 21 5.5 9.5 12 3z" /><circle cx="12" cy="10" r="2" /><path strokeLinecap="round" d="M12 12v9" /></>}</svg>
}

const tools: Array<{ id: EditorTool; label: string; shortcut: string; icon: ReactNode; divider?: boolean }> = [
  { id: 'move', label: 'Move', shortcut: 'V', icon: <MoveToolIcon className="size-[19px]" /> },
  { id: 'marquee', label: 'Rectangular Marquee', shortcut: 'M', icon: <MarqueeToolIcon className="size-[19px]" />, divider: true },
  { id: 'ellipse-select', label: 'Elliptical Marquee', shortcut: 'Shift M', icon: <MarqueeToolIcon className="size-[19px]" ellipse /> },
  { id: 'single-row-select', label: 'Single Row Marquee', shortcut: '', icon: <MarqueeToolIcon className="size-[19px]" /> },
  { id: 'single-column-select', label: 'Single Column Marquee', shortcut: '', icon: <MarqueeToolIcon className="size-[19px]" /> },
  { id: 'lasso', label: 'Lasso', shortcut: 'L', icon: <LassoToolIcon className="size-[19px]" /> },
  { id: 'polygonal-lasso', label: 'Polygonal Lasso', shortcut: 'Shift L', icon: <LassoToolIcon className="size-[19px]" /> },
  { id: 'magnetic-lasso', label: 'Magnetic Lasso', shortcut: '', icon: <LassoToolIcon className="size-[19px]" /> },
  { id: 'magic-wand', label: 'Magic Wand', shortcut: 'W', icon: <WandToolIcon className="size-[19px]" /> },
  { id: 'object-select', label: 'Object Select', shortcut: 'Shift W', icon: <ObjectSelectToolIcon className="size-[19px]" /> },
  { id: 'crop', label: 'Crop', shortcut: 'C', icon: <CropToolIcon className="size-[19px]" /> },
  { id: 'perspective-crop', label: 'Perspective Crop', shortcut: 'Shift C', icon: <CropToolIcon className="size-[19px]" /> },
  { id: 'eyedropper', label: 'Eyedropper', shortcut: 'I', icon: <EyedropperToolIcon className="size-[19px]" />, divider: true },
  { id: 'measure', label: 'Measure / Straighten', shortcut: 'Shift I', icon: <MeasureToolIcon className="size-[19px]" /> },
  { id: 'healing', label: 'Healing Brush', shortcut: 'J', icon: <HealingToolIcon className="size-[19px]" /> },
  { id: 'clone-stamp', label: 'Clone Stamp', shortcut: 'S', icon: <CloneToolIcon className="size-[19px]" /> },
  { id: 'brush', label: 'Brush', shortcut: 'B', icon: <BrushToolIcon className="size-[19px]" /> },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: <EraserToolIcon className="size-[19px]" /> },
  { id: 'fill', label: 'Paint Bucket', shortcut: 'G', icon: <FillToolIcon className="size-[19px]" /> },
  { id: 'gradient', label: 'Gradient', shortcut: 'Shift G', icon: <GradientToolIcon className="size-[19px]" /> },
  { id: 'dodge', label: 'Dodge', shortcut: 'O', icon: <ToneToolIcon className="size-[19px]" /> },
  { id: 'burn', label: 'Burn', shortcut: 'Shift O', icon: <ToneToolIcon className="size-[19px]" burn /> },
  { id: 'text', label: 'Type', shortcut: 'T', icon: <TextIcon className="size-[19px]" />, divider: true },
  { id: 'pen', label: 'Pen', shortcut: 'P', icon: <PenToolIcon className="size-[19px]" /> },
  { id: 'direct-select', label: 'Direct Selection', shortcut: 'A', icon: <PenToolIcon className="size-[19px]" selection /> },
  { id: 'path-select', label: 'Path Selection', shortcut: 'Shift A', icon: <MoveToolIcon className="size-[19px]" /> },
  { id: 'warp', label: 'Warp', shortcut: '', icon: <span className="text-base">⌗</span> },
  { id: 'puppet-warp', label: 'Puppet Warp', shortcut: '', icon: <span className="text-base">◎</span> },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'U', icon: <RectangleIcon className="size-[19px]" /> },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'Shift U', icon: <CircleIcon className="size-[19px]" /> },
  { id: 'hand', label: 'Hand', shortcut: 'H', icon: <HandToolIcon className="size-[19px]" />, divider: true },
  { id: 'zoom', label: 'Zoom', shortcut: 'Z', icon: <ZoomToolIcon className="size-[19px]" /> },
]

type ToolRailProps = {
  tool: EditorTool
  onChange: (tool: EditorTool) => void
}

export function ToolRail({ tool, onChange }: ToolRailProps) {
  return (
    <aside aria-label="Tools" className="order-0 flex h-12 w-full shrink-0 items-center overflow-x-auto border-b border-white/[0.07] bg-[#111113] px-1.5 lg:h-[calc(100vh-84px)] lg:w-12 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-0 lg:py-1.5">
      {tools.map((item) => (
        <div key={item.id} className={`shrink-0 ${item.divider ? 'ml-1.5 border-l border-white/[0.07] pl-1.5 lg:mt-1.5 lg:ml-0 lg:border-t lg:border-l-0 lg:pt-1.5 lg:pl-0' : ''}`}>
          <button
            type="button"
            title={`${item.label} (${item.shortcut})`}
            aria-label={`${item.label} tool`}
            aria-pressed={tool === item.id}
            onClick={() => onChange(item.id)}
            className={`relative flex size-9 items-center justify-center rounded-md transition focus-visible:outline-2 focus-visible:outline-violet-400 ${tool === item.id ? 'bg-violet-400/15 text-violet-200 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.12)]' : 'text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200'}`}
          >
            {item.icon}
            <span className="absolute right-1 bottom-0.5 text-[7px] leading-none text-current/45">{item.shortcut.replace('Shift ', '⇧')}</span>
          </button>
        </div>
      ))}
    </aside>
  )
}
