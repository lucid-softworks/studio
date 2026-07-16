import { useEffect, useState } from 'react'
import { EditorErrorBoundary, StudioEditor } from '@studio/editor'
import { LandingPage } from './LandingPage'

function editorRoute() {
  return window.location.pathname === '/app' || window.location.hash === '#/app'
}

export default function App() {
  const [isEditor, setIsEditor] = useState(editorRoute)

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
    ? <EditorErrorBoundary onExit={() => navigate('home')}><StudioEditor onExit={() => navigate('home')} /></EditorErrorBoundary>
    : <LandingPage onOpenEditor={() => navigate('editor')} />
}
