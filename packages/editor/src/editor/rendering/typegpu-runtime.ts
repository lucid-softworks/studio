import type { TgpuRoot } from 'typegpu'

export type TypeGpuRuntimeStatus =
  | { state: 'idle' }
  | { state: 'initializing' }
  | { state: 'ready'; features: readonly GPUFeatureName[] }
  | { state: 'unavailable'; reason: string }
  | { state: 'lost'; reason: string }

type StatusListener = () => void

let root: TgpuRoot | null = null
let status: TypeGpuRuntimeStatus = { state: 'idle' }
let initialization: Promise<TypeGpuRuntimeStatus> | null = null
let generation = 0
let recoveryAttempt = 0
let recoveryTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<StatusListener>()

function updateStatus(nextStatus: TypeGpuRuntimeStatus) {
  status = nextStatus
  for (const listener of listeners) listener()
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'A compatible GPU adapter could not be created.'
}

export function typeGpuRecoveryDelay(attempt: number) {
  return Math.min(250 * 2 ** Math.max(0, attempt - 1), 4_000)
}

function clearRecoveryTimer() {
  if (recoveryTimer !== null) clearTimeout(recoveryTimer)
  recoveryTimer = null
}

function scheduleRecovery(expectedGeneration: number) {
  if (recoveryTimer !== null || expectedGeneration !== generation) return
  recoveryAttempt += 1
  recoveryTimer = setTimeout(() => {
    recoveryTimer = null
    if (expectedGeneration !== generation) return
    void initializeTypeGpuRuntime().then((nextStatus) => {
      if (expectedGeneration !== generation || nextStatus.state === 'ready') return
      scheduleRecovery(expectedGeneration)
    })
  }, typeGpuRecoveryDelay(recoveryAttempt))
}

export function getTypeGpuRuntimeStatus() {
  return status
}

export function subscribeToTypeGpuRuntime(listener: StatusListener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getTypeGpuRoot() {
  return root
}

export function initializeTypeGpuRuntime(): Promise<TypeGpuRuntimeStatus> {
  if (status.state === 'ready') return Promise.resolve(status)
  if (initialization) return initialization

  if (typeof navigator === 'undefined' || !navigator.gpu) {
    const unavailable: TypeGpuRuntimeStatus = {
      state: 'unavailable',
      reason: 'WebGPU is not available in this browser or context.',
    }
    updateStatus(unavailable)
    return Promise.resolve(unavailable)
  }

  const currentGeneration = generation
  updateStatus({ state: 'initializing' })
  initialization = import('typegpu')
    .then(async ({ default: tgpu }) => {
      const nextRoot = await tgpu.init({ adapter: { powerPreference: 'high-performance' } })
      if (currentGeneration !== generation) {
        nextRoot.destroy()
        return status
      }

      const { validateTypeGpuCompositor } = await import('./typegpu-compositor')
      try {
        validateTypeGpuCompositor(nextRoot)
      } catch (error) {
        nextRoot.destroy()
        throw error
      }
      root = nextRoot
      recoveryAttempt = 0
      clearRecoveryTimer()
      const ready: TypeGpuRuntimeStatus = {
        state: 'ready',
        features: [...nextRoot.enabledFeatures].sort(),
      }
      updateStatus(ready)

      void nextRoot.device.lost.then((info) => {
        if (root !== nextRoot || currentGeneration !== generation) return
        root = null
        initialization = null
        updateStatus({ state: 'lost', reason: info.message || `The WebGPU device was ${info.reason}.` })
        scheduleRecovery(currentGeneration)
      })

      return ready
    })
    .catch((error: unknown) => {
      if (currentGeneration !== generation) return status
      const unavailable: TypeGpuRuntimeStatus = { state: 'unavailable', reason: errorMessage(error) }
      updateStatus(unavailable)
      return unavailable
    })
    .finally(() => {
      if (status.state !== 'ready') initialization = null
    })

  return initialization
}

export function disposeTypeGpuRuntime() {
  generation += 1
  recoveryAttempt = 0
  clearRecoveryTimer()
  const currentRoot = root
  root = null
  initialization = null
  updateStatus({ state: 'idle' })
  currentRoot?.destroy()
}
