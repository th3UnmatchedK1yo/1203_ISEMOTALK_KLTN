import { afterEach, describe, expect, it, vi } from 'vitest'
import { startPolling } from '../lib/polling'

afterEach(() => vi.useRealTimers())

describe('serialized polling', () => {
  it('does not start another request while the previous response is pending', async () => {
    vi.useFakeTimers()
    const resolvers: Array<(value: number) => void> = []
    const received: number[] = []
    const stop = startPolling({
      load: () => new Promise<number>(resolve => resolvers.push(resolve)),
      onData: value => received.push(value), onError: () => {}, intervalMs: 100,
      shouldContinue: value => value < 2,
    })
    await vi.advanceTimersByTimeAsync(1000)
    expect(resolvers).toHaveLength(1)
    resolvers[0](1)
    await vi.advanceTimersByTimeAsync(100)
    expect(received).toEqual([1])
    expect(resolvers).toHaveLength(2)
    resolvers[1](2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(received).toEqual([1, 2])
    expect(resolvers).toHaveLength(2)
    stop()
  })

  it('aborts and ignores a late response after the user leaves the call', async () => {
    let resolve!: (value: string) => void
    let signal!: AbortSignal
    const received: string[] = []
    const stop = startPolling({
      load: incoming => { signal = incoming; return new Promise<string>(done => { resolve = done }) },
      onData: value => received.push(value), onError: () => {},
    })
    stop()
    resolve('response for a previous route')
    await Promise.resolve()
    expect(signal.aborted).toBe(true)
    expect(received).toEqual([])
  })

  it('continues after a transient error and stops once processing is ready', async () => {
    vi.useFakeTimers()
    let attempt = 0
    const events: string[] = []
    const stop = startPolling({
      load: async () => { if (++attempt === 1) throw new Error('Offline'); return 'ready' },
      onData: value => events.push(value), onError: error => events.push(error.message),
      shouldContinue: value => value !== 'ready', intervalMs: 100,
    })
    await vi.advanceTimersByTimeAsync(1000)
    expect(events).toEqual(['Offline', 'ready'])
    expect(attempt).toBe(2)
    stop()
  })
})
