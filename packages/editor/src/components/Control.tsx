import type { ReactNode } from 'react'
import { numericInputValue } from './input-values'

type SectionProps = {
  title: string
  children: ReactNode
  action?: ReactNode
}

export function ControlSection({ title, children, action }: SectionProps) {
  return (
    <section className="border-b border-white/[0.07] px-5 py-5 last:border-b-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-zinc-500 uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

type RangeControlProps = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
  onChangeEnd?: () => void
}

export function RangeControl({ label, value, min, max, step = 1, suffix = '', onChange, onChangeEnd }: RangeControlProps) {
  return (
    <div className="block py-2.5">
      <span className="mb-2.5 flex items-center justify-between text-[13px]">
        <span className="font-medium text-zinc-300">{label}</span>
        <output className="min-w-11 rounded-md bg-white/[0.06] px-2 py-1 text-center font-mono text-[11px] text-zinc-400">
          {value}{suffix}
        </output>
      </span>
      <input
        className="studio-range block w-full"
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(numericInputValue(event.currentTarget, value))}
        onPointerUp={onChangeEnd}
        onKeyUp={onChangeEnd}
        onBlur={onChangeEnd}
      />
    </div>
  )
}
