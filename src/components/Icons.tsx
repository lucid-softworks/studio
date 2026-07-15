type IconProps = { className?: string }

export function UploadIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v3A2.5 2.5 0 007.5 20h9a2.5 2.5 0 002.5-2.5v-3" />
    </svg>
  )
}

export function DownloadIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />
    </svg>
  )
}

export function ResetIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 9A8 8 0 1112 20a8 8 0 01-7.3-4.7M4.5 9V4.5M4.5 9H9" />
    </svg>
  )
}

export function ImageIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <circle cx="9" cy="9.5" r="1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 17l4.2-4.2a2 2 0 012.8 0l1.3 1.3 1.1-1.1a2 2 0 012.8 0l2.8 2.8" />
    </svg>
  )
}

export function ChevronIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10l4 4 4-4" />
    </svg>
  )
}

export function UndoIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 8H4m0 0l3.5-3.5M4 8l3.5 3.5M5 15a8 8 0 101.8-5" />
    </svg>
  )
}

export function RedoIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 8h5m0 0l-3.5-3.5M20 8l-3.5 3.5M19 15a8 8 0 11-1.8-5" />
    </svg>
  )
}

export function EyeIcon({ className = 'size-4', closed = false }: IconProps & { closed?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {closed ? (
        <><path strokeLinecap="round" d="M3 3l18 18"/><path strokeLinecap="round" strokeLinejoin="round" d="M10.6 10.7a2 2 0 002.7 2.7M9.8 5.2A10.7 10.7 0 0112 5c5.5 0 9 7 9 7a15 15 0 01-2.2 3.2M6.2 6.2C4.2 7.7 3 12 3 12s3.5 7 9 7a9.7 9.7 0 003.1-.5"/></>
      ) : (
        <><path strokeLinecap="round" strokeLinejoin="round" d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z"/><circle cx="12" cy="12" r="2.5"/></>
      )}
    </svg>
  )
}

export function LockIcon({ className = 'size-4', locked = true }: IconProps & { locked?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path strokeLinecap="round" d={locked ? 'M8 10V7a4 4 0 018 0v3' : 'M16 10V7a4 4 0 00-7.5-2'} />
    </svg>
  )
}

export function TrashIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
    </svg>
  )
}

export function TextIcon({ className = 'size-4' }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path strokeLinecap="round" d="M5 5h14M12 5v14M8.5 19h7" /></svg>
}

export function RectangleIcon({ className = 'size-4' }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="2" /></svg>
}

export function CircleIcon({ className = 'size-4' }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8" /></svg>
}
