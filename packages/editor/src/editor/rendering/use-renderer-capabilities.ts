import { useEffect, useSyncExternalStore } from 'react'
import {
  getTypeGpuRuntimeStatus,
  initializeTypeGpuRuntime,
  subscribeToTypeGpuRuntime,
} from './typegpu-runtime'
import { buildNativeLayerCompositionPlan } from './render-plan'
import type { EditorDocument } from '../types'

const idleStatus = { state: 'idle' as const }
const serverSnapshot = () => idleStatus

export function useRendererCapabilities(document: EditorDocument) {
  const typegpu = useSyncExternalStore(
    subscribeToTypeGpuRuntime,
    getTypeGpuRuntimeStatus,
    serverSnapshot,
  )

  useEffect(() => {
    void initializeTypeGpuRuntime()
  }, [])

  const supportsNativeLayers = buildNativeLayerCompositionPlan(document) !== null
  const activeRenderer: 'webgpu' | 'canvas2d' = typegpu.state === 'ready' && supportsNativeLayers ? 'webgpu' : 'canvas2d'

  return {
    activeRenderer,
    supportsNativeLayers,
    typegpu,
  }
}
