export type ToastTone = 'success' | 'info' | 'warning' | 'error'
export type ToastMessage = { message: string; tone: ToastTone }

const toneStyles: Record<ToastTone, { shell: string; dot: string; label: string }> = {
  success: { shell: 'border-emerald-300/20 bg-emerald-950/95 text-emerald-50', dot: 'bg-emerald-400', label: 'Success' },
  info: { shell: 'border-sky-300/20 bg-sky-950/95 text-sky-50', dot: 'bg-sky-400', label: 'Info' },
  warning: { shell: 'border-amber-300/20 bg-amber-950/95 text-amber-50', dot: 'bg-amber-400', label: 'Warning' },
  error: { shell: 'border-rose-300/20 bg-rose-950/95 text-rose-50', dot: 'bg-rose-400', label: 'Error' },
}

export function Toast({ value, onDismiss }: { value: ToastMessage; onDismiss: () => void }) {
  const style = toneStyles[value.tone]
  return (
    <div role={value.tone === 'error' ? 'alert' : 'status'} className={`fixed top-16 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3 rounded-lg border px-3.5 py-3 text-xs shadow-[0_18px_55px_rgba(0,0,0,0.45)] backdrop-blur-xl ${style.shell}`}>
      <span className={`mt-1 size-2 shrink-0 rounded-full shadow-[0_0_12px_currentColor] ${style.dot}`} />
      <div className="min-w-0 flex-1"><p className="text-[9px] font-bold tracking-[0.14em] opacity-55 uppercase">{style.label}</p><p className="mt-0.5 leading-relaxed">{value.message}</p></div>
      <button type="button" className="flex size-6 shrink-0 items-center justify-center rounded text-current opacity-45 transition hover:bg-white/10 hover:opacity-100" onClick={onDismiss} aria-label="Dismiss notification">×</button>
    </div>
  )
}
