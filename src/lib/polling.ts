export interface PollingOptions<T> {
  load: (signal: AbortSignal) => Promise<T>
  onData: (value: T) => void
  onError: (error: Error) => void
  shouldContinue?: (value: T) => boolean
  intervalMs?: number
  immediate?: boolean
}

/** One request at a time; cleanup also rejects completions from an old route. */
export function startPolling<T>({ load, onData, onError, shouldContinue = () => true, intervalMs = 2500, immediate = true }: PollingOptions<T>): () => void {
  const controller = new AbortController()
  let active = true
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = async () => {
    try {
      const value = await load(controller.signal)
      if (!active) return
      onData(value)
      if (!shouldContinue(value)) return
    } catch (error) {
      if (!active || controller.signal.aborted) return
      onError(error instanceof Error ? error : new Error('Không tải được dữ liệu.'))
    }
    if (active) timer = setTimeout(() => { void run() }, intervalMs)
  }
  if (immediate) void run()
  else timer = setTimeout(() => { void run() }, intervalMs)
  return () => {
    active = false
    controller.abort()
    if (timer !== undefined) clearTimeout(timer)
  }
}
