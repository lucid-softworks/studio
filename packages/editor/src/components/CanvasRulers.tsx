import { useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import { rulerStep, rulerValues } from './canvas-ruler-scale'
import type { DocumentGuide } from '../editor/types'

type Metrics = { width: number; height: number; canvasLeft: number; canvasTop: number; scaleX: number; scaleY: number; scrollLeft: number; scrollTop: number }

export function CanvasRulers({ stageRef, canvasRef, zoom, guides = [] }: { stageRef: RefObject<HTMLDivElement | null>; canvasRef: RefObject<HTMLCanvasElement | null>; zoom: number; guides?: DocumentGuide[] }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)

  useLayoutEffect(() => {
    let frame = 0
    let settleTimer = 0
    let observer: ResizeObserver | null = null
    let stage: HTMLDivElement | null = null
    const update = () => {
      const canvas = canvasRef.current
      if (!stage || !canvas) return
      const stageRect = stage.getBoundingClientRect()
      const canvasRect = canvas.getBoundingClientRect()
      setMetrics({
        width: stage.clientWidth,
        height: stage.clientHeight,
        canvasLeft: canvasRect.left - stageRect.left,
        canvasTop: canvasRect.top - stageRect.top,
        scaleX: canvasRect.width / Math.max(1, canvas.width),
        scaleY: canvasRect.height / Math.max(1, canvas.height),
        scrollLeft: stage.scrollLeft,
        scrollTop: stage.scrollTop,
      })
    }
    const connect = () => {
      stage = stageRef.current
      const canvas = canvasRef.current
      if (!stage || !canvas) {
        frame = requestAnimationFrame(connect)
        return
      }
      observer = new ResizeObserver(update)
      observer.observe(stage)
      observer.observe(canvas)
      stage.addEventListener('scroll', update, { passive: true })
      window.addEventListener('resize', update)
      update()
      settleTimer = window.setTimeout(update, 180)
    }
    connect()
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(settleTimer)
      observer?.disconnect()
      stage?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [canvasRef, stageRef, zoom])

  const ticks = useMemo(() => {
    if (!metrics) return null
    const xStep = rulerStep(metrics.scaleX)
    const yStep = rulerStep(metrics.scaleY)
    return {
      xStep,
      yStep,
      x: rulerValues(-metrics.canvasLeft / metrics.scaleX, (metrics.width - metrics.canvasLeft) / metrics.scaleX, xStep / 5),
      y: rulerValues(-metrics.canvasTop / metrics.scaleY, (metrics.height - metrics.canvasTop) / metrics.scaleY, yStep / 5),
    }
  }, [metrics])

  if (!metrics || !ticks) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-30" style={{ transform: `translate(${metrics.scrollLeft}px, ${metrics.scrollTop}px)` }} aria-hidden="true">
      <svg width={metrics.width} height="22" className="absolute top-0 left-0 bg-[#151518]/95 text-zinc-500 shadow-[0_1px_rgba(255,255,255,0.06)]">
        {ticks.x.map((value, index) => {
          const x = metrics.canvasLeft + value * metrics.scaleX
          const major = Math.abs(value / ticks.xStep - Math.round(value / ticks.xStep)) < 0.001
          return <g key={index}><line x1={x} x2={x} y1={major ? 9 : 15} y2="22" stroke="currentColor" strokeWidth="0.7" />{major && <text x={x + 3} y="8" fill="currentColor" fontSize="7" fontFamily="monospace">{Math.round(value)}</text>}</g>
        })}
      </svg>
      <svg width="22" height={metrics.height} className="absolute top-0 left-0 bg-[#151518]/95 text-zinc-500 shadow-[1px_0_rgba(255,255,255,0.06)]">
        {ticks.y.map((value, index) => {
          const y = metrics.canvasTop + value * metrics.scaleY
          const major = Math.abs(value / ticks.yStep - Math.round(value / ticks.yStep)) < 0.001
          return <g key={index}><line x1={major ? 9 : 15} x2="22" y1={y} y2={y} stroke="currentColor" strokeWidth="0.7" />{major && <text x="7" y={y + 3} fill="currentColor" fontSize="7" fontFamily="monospace" textAnchor="middle" transform={`rotate(-90 7 ${y + 3})`}>{Math.round(value)}</text>}</g>
        })}
      </svg>
      <div className="absolute top-0 left-0 size-[22px] border-r border-b border-white/[0.08] bg-[#1a1a1e]" />
      {guides.map((guide) => guide.direction === 'vertical'
        ? <div key={guide.id} className="absolute top-[22px] bottom-0 w-px bg-cyan-400/75 shadow-[0_0_3px_rgba(34,211,238,0.5)]" style={{ left: metrics.canvasLeft + guide.position * metrics.scaleX }} />
        : <div key={guide.id} className="absolute right-0 left-[22px] h-px bg-cyan-400/75 shadow-[0_0_3px_rgba(34,211,238,0.5)]" style={{ top: metrics.canvasTop + guide.position * metrics.scaleY }} />)}
    </div>
  )
}
