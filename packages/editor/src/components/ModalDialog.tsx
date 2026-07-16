import { useEffect, useRef, type ReactNode } from 'react'

type Props = {
  label: string
  children: ReactNode
  className?: string
  onDismiss: () => void
}

export function ModalDialog({ label, children, className = '', onDismiss }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(event) => { event.preventDefault(); onDismiss() }}
      className={`m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-inherit backdrop:bg-black/70 ${className}`}
    >
      {children}
    </dialog>
  )
}
