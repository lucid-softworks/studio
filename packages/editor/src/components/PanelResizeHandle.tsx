import type { KeyboardEvent, PointerEvent } from 'react'
import { clampPanelWidth, maximumPanelWidth, minimumPanelWidth } from '../editor/panel-layout'

export function PanelResizeHandle({ dockSide, width, onChange, label }: {
  dockSide: 'left' | 'right'
  width: number
  onChange: (width: number) => void
  label: string
}) {
  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const handle = event.currentTarget
    const startX = event.clientX
    const startWidth = width
    handle.setPointerCapture(event.pointerId)
    const move = (moveEvent: globalThis.PointerEvent) => {
      const delta = dockSide === 'left' ? moveEvent.clientX - startX : startX - moveEvent.clientX
      onChange(clampPanelWidth(startWidth + delta))
    }
    const finish = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', finish)
      handle.removeEventListener('pointercancel', finish)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', finish)
    handle.addEventListener('pointercancel', finish)
  }

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    onChange(clampPanelWidth(width + direction * (dockSide === 'left' ? 12 : -12)))
  }

  return (
    <div
      role="separator"
      aria-label={`Resize ${label}`}
      aria-orientation="vertical"
      aria-valuemin={minimumPanelWidth}
      aria-valuemax={maximumPanelWidth}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={startResize}
      onKeyDown={resizeWithKeyboard}
      className={`group absolute top-0 bottom-0 z-40 hidden w-2 cursor-col-resize touch-none focus-visible:outline-none lg:block ${dockSide === 'left' ? '-right-1' : '-left-1'}`}
    >
      <span className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition group-hover:bg-violet-400/60 group-focus-visible:bg-violet-400" />
    </div>
  )
}
