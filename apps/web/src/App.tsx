import { useEffect, useMemo, useState } from 'react'
import { createPerformanceFixture, EditorErrorBoundary, EditorPerformanceMetrics, performanceFixtureIds, StudioEditor, type PerformanceSnapshot } from '@studio/editor'
import { LandingPage } from './LandingPage'

declare global {
  interface Window {
    __studioPerformance?: { fixture: string; snapshot: () => PerformanceSnapshot }
  }
}

function editorRoute() {
  return window.location.pathname === '/app' || window.location.hash === '#/app'
}

export default function App() {
  const [isEditor, setIsEditor] = useState(editorRoute)
  const benchmark = useMemo(() => {
    if (!import.meta.env.DEV) return null
    const id = new URLSearchParams(window.location.search).get('benchmark')
    return id && performanceFixtureIds.includes(id as (typeof performanceFixtureIds)[number]) ? createPerformanceFixture(id as (typeof performanceFixtureIds)[number]) : null
  }, [])
  const performanceMetrics = useMemo(() => benchmark ? new EditorPerformanceMetrics() : undefined, [benchmark])
  const rendererOverride = useMemo(() => new URLSearchParams(window.location.search).get('renderer') === 'canvas2d' ? 'canvas2d' as const : undefined, [])

  useEffect(() => {
    if (!benchmark || !performanceMetrics) return
    window.__studioPerformance = { fixture: benchmark.id, snapshot: () => performanceMetrics.snapshot() }
    return () => { delete window.__studioPerformance }
  }, [benchmark, performanceMetrics])

  useEffect(() => {
    const syncRoute = () => setIsEditor(editorRoute())
    window.addEventListener('popstate', syncRoute)
    window.addEventListener('hashchange', syncRoute)
    return () => {
      window.removeEventListener('popstate', syncRoute)
      window.removeEventListener('hashchange', syncRoute)
    }
  }, [])

  useEffect(() => {
    document.title = isEditor ? 'Studio — Image Editor' : 'Studio — Create without compromise'
  }, [isEditor])

  const navigate = (route: 'home' | 'editor') => {
    const nextPath = route === 'editor' ? '/app' : '/'
    if (window.location.protocol === 'file:') window.location.hash = route === 'editor' ? '/app' : '/'
    else window.history.pushState({}, '', nextPath)
    setIsEditor(route === 'editor')
    window.scrollTo({ top: 0 })
  }

  return isEditor
    ? <EditorErrorBoundary onExit={() => navigate('home')}><StudioEditor onExit={() => navigate('home')} initialState={benchmark?.document} performanceMetrics={performanceMetrics} rendererOverride={rendererOverride} /></EditorErrorBoundary>
    : <LandingPage onOpenEditor={() => navigate('editor')} />
}
