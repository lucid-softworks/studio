import { useEffect, useSyncExternalStore } from 'react'
import {
  getTypeGpuRuntimeStatus,
  initializeTypeGpuRuntime,
  subscribeToTypeGpuRuntime,
} from './typegpu-runtime'

const idleStatus = { state: 'idle' as const }
const serverSnapshot = () => idleStatus

export function useRendererCapabilities() {
  const typegpu = useSyncExternalStore(
    subscribeToTypeGpuRuntime,
    getTypeGpuRuntimeStatus,
    serverSnapshot,
  )

  useEffect(() => {
    void initializeTypeGpuRuntime()
  }, [])

  return {
    activeRenderer: 'canvas2d' as const,
    typegpu,
  }
}
