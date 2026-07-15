import type { ReactNode } from 'react'
import { CircleIcon, RectangleIcon, TextIcon } from './Icons'

export type EditorTool =
  | 'move'
  | 'marquee'
  | 'ellipse-select'
  | 'eyedropper'
  | 'brush'
  | 'eraser'
  | 'text'
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

const tools: Array<{ id: EditorTool; label: string; shortcut: string; icon: ReactNode; divider?: boolean }> = [
  { id: 'move', label: 'Move', shortcut: 'V', icon: <MoveToolIcon className="size-[19px]" /> },
  { id: 'marquee', label: 'Rectangular Marquee', shortcut: 'M', icon: <MarqueeToolIcon className="size-[19px]" />, divider: true },
  { id: 'ellipse-select', label: 'Elliptical Marquee', shortcut: 'Shift M', icon: <MarqueeToolIcon className="size-[19px]" ellipse /> },
  { id: 'eyedropper', label: 'Eyedropper', shortcut: 'I', icon: <EyedropperToolIcon className="size-[19px]" />, divider: true },
  { id: 'brush', label: 'Brush', shortcut: 'B', icon: <BrushToolIcon className="size-[19px]" /> },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: <EraserToolIcon className="size-[19px]" /> },
  { id: 'text', label: 'Type', shortcut: 'T', icon: <TextIcon className="size-[19px]" />, divider: true },
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
    <aside aria-label="Tools" className="order-0 flex h-12 w-full shrink-0 items-center overflow-x-auto border-b border-white/[0.07] bg-[#111113] px-1.5 lg:h-[calc(100vh-48px)] lg:w-12 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-0 lg:py-1.5">
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
