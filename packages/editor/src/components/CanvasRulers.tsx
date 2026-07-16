import { useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import { rulerStep, rulerValues } from './canvas-ruler-scale'
import type { DocumentArtboard, DocumentGridSettings, DocumentGuide } from '../editor/types'

type Metrics = { width: number; height: number; canvasLeft: number; canvasTop: number; scaleX: number; scaleY: number; scrollLeft: number; scrollTop: number }

export function CanvasRulers({ stageRef, canvasRef, zoom, guides = [], grid, artboards = [] }: { stageRef: RefObject<HTMLDivElement | null>; canvasRef: RefObject<HTMLCanvasElement | null>; zoom: number; guides?: DocumentGuide[]; grid?: DocumentGridSettings; artboards?: DocumentArtboard[] }) {
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
  const canvas = canvasRef.current
  const gridStep = grid ? grid.spacing / Math.max(1, grid.subdivisions) : 0
  const verticalGridLines = grid?.visible && canvas ? Array.from({ length: Math.min(2000, Math.floor(canvas.width / gridStep)) }, (_, index) => (index + 1) * gridStep) : []
  const horizontalGridLines = grid?.visible && canvas ? Array.from({ length: Math.min(2000, Math.floor(canvas.height / gridStep)) }, (_, index) => (index + 1) * gridStep) : []
  return (
    <div className="pointer-events-none absolute inset-0 z-30" style={{ transform: `translate(${metrics.scrollLeft}px, ${metrics.scrollTop}px)` }} aria-hidden="true">
      {grid?.visible && canvas && <svg className="absolute" style={{ left: metrics.canvasLeft, top: metrics.canvasTop }} width={canvas.width * metrics.scaleX} height={canvas.height * metrics.scaleY}>
        {verticalGridLines.map((position, index) => <line key={`x-${index}`} x1={position * metrics.scaleX} x2={position * metrics.scaleX} y1="0" y2="100%" stroke={grid.color} strokeOpacity={(index + 1) % grid.subdivisions === 0 ? 0.52 : 0.22} strokeWidth={(index + 1) % grid.subdivisions === 0 ? 0.8 : 0.5} />)}
        {horizontalGridLines.map((position, index) => <line key={`y-${index}`} y1={position * metrics.scaleY} y2={position * metrics.scaleY} x1="0" x2="100%" stroke={grid.color} strokeOpacity={(index + 1) % grid.subdivisions === 0 ? 0.52 : 0.22} strokeWidth={(index + 1) % grid.subdivisions === 0 ? 0.8 : 0.5} />)}
      </svg>}
      {artboards.map((artboard) => <div key={artboard.id} className="absolute border border-violet-300/65 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" style={{ left: metrics.canvasLeft + artboard.x * metrics.scaleX, top: metrics.canvasTop + artboard.y * metrics.scaleY, width: artboard.width * metrics.scaleX, height: artboard.height * metrics.scaleY }}><span className="absolute bottom-full left-0 rounded-t bg-violet-400/85 px-1.5 py-0.5 text-[8px] font-semibold text-violet-950">{artboard.name}</span></div>)}
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
