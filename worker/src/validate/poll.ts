export interface PollOptions {
  timeoutMs: number
  intervalMs: number
}

export async function poll<T>(
  fn: () => Promise<T>,
  opts: PollOptions,
): Promise<T> {
  const start = Date.now()
  while (Date.now() - start < opts.timeoutMs) {
    try {
      return await fn()
    } catch {
      await sleep(opts.intervalMs)
    }
  }
  return fn()
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
