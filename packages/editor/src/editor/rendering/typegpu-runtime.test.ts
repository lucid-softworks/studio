import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  disposeTypeGpuRuntime,
  getTypeGpuRuntimeStatus,
  initializeTypeGpuRuntime,
  subscribeToTypeGpuRuntime,
  typeGpuRecoveryDelay,
} from './typegpu-runtime'

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  validate: vi.fn(),
}))

vi.mock('typegpu', () => ({ default: { init: mocks.init } }))
vi.mock('./typegpu-compositor', () => ({ validateTypeGpuCompositor: mocks.validate }))

function runtimeRoot(lost: Promise<GPUDeviceLostInfo>) {
  return {
    enabledFeatures: new Set<GPUFeatureName>(),
    device: { lost },
    destroy: vi.fn(),
  }
}

describe('TypeGPU runtime', () => {
  afterEach(() => {
    disposeTypeGpuRuntime()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('reports a stable fallback when WebGPU is unavailable', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToTypeGpuRuntime(listener)

    const result = await initializeTypeGpuRuntime()

    expect(result).toEqual({
      state: 'unavailable',
      reason: 'WebGPU is not available in this browser or context.',
    })
    expect(getTypeGpuRuntimeStatus()).toEqual(result)
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('returns to idle when disposed', async () => {
    await initializeTypeGpuRuntime()

    disposeTypeGpuRuntime()

    expect(getTypeGpuRuntimeStatus()).toEqual({ state: 'idle' })
  })

  it('bounds exponential recovery delays', () => {
    expect([1, 2, 3, 10].map(typeGpuRecoveryDelay)).toEqual([250, 500, 1_000, 4_000])
  })

  it('falls back on device loss and recreates the runtime automatically', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { gpu: {} })
    let loseDevice: ((info: GPUDeviceLostInfo) => void) | undefined
    const firstLost = new Promise<GPUDeviceLostInfo>((resolve) => { loseDevice = resolve })
    const secondLost = new Promise<GPUDeviceLostInfo>(() => undefined)
    mocks.init
      .mockResolvedValueOnce(runtimeRoot(firstLost))
      .mockResolvedValueOnce(runtimeRoot(secondLost))

    await expect(initializeTypeGpuRuntime()).resolves.toMatchObject({ state: 'ready' })
    loseDevice?.({ message: 'The adapter reset.', reason: 'unknown' } as GPUDeviceLostInfo)
    await vi.waitFor(() => expect(getTypeGpuRuntimeStatus()).toEqual({ state: 'lost', reason: 'The adapter reset.' }))

    await vi.advanceTimersByTimeAsync(250)

    expect(mocks.init).toHaveBeenCalledTimes(2)
    expect(getTypeGpuRuntimeStatus()).toMatchObject({ state: 'ready' })
  })
})
