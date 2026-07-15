import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  disposeTypeGpuRuntime,
  getTypeGpuRuntimeStatus,
  initializeTypeGpuRuntime,
  subscribeToTypeGpuRuntime,
} from './typegpu-runtime'

describe('TypeGPU runtime', () => {
  afterEach(() => disposeTypeGpuRuntime())

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
})
