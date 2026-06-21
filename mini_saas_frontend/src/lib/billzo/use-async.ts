import { useState, useCallback } from 'react'

export interface UseAsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export interface UseAsyncResult<T> extends UseAsyncState<T> {
  fetch: () => Promise<void>
  reset: () => void
}

/**
 * Hook for managing async operations with proper error handling
 */
export function useAsync<T>(
  asyncFn: () => Promise<T>,
  deps: React.DependencyList = []
): UseAsyncResult<T> {
  const [state, setState] = useState<UseAsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  })

  const fetch = useCallback(async () => {
    setState({ data: null, loading: true, error: null })
    try {
      const result = await asyncFn()
      setState({ data: result, loading: false, error: null })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setState({ data: null, loading: false, error: errorMessage })
    }
  }, deps)

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
  }, [])

  return { ...state, fetch, reset }
}

/**
 * Hook for managing API fetch with proper error handling
 */
export function useApiFetch<T>(
  url: string,
  options?: RequestInit
): UseAsyncResult<T> {
  return useAsync(async () => {
    const res = await fetch(url, { ...options, credentials: 'include' })

    if (!res.ok) {
      let errorMessage = `HTTP ${res.status}`
      try {
        const data = await res.json()
        errorMessage = data.error || errorMessage
      } catch {
        // Ignore JSON parse errors
      }
      throw new Error(errorMessage)
    }

    const data = await res.json()
    return data
  }, [url, options])
}

/**
 * Hook for POST/PATCH/DELETE operations
 */
export interface MutationOptions extends RequestInit {
  method: 'POST' | 'PATCH' | 'DELETE' | 'PUT'
}

export function useMutation<T = void>(url: string) {
  const [state, setState] = useState<UseAsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  })

  const mutate = useCallback(
    async (payload?: Record<string, any>, options?: Partial<MutationOptions>) => {
      setState({ data: null, loading: true, error: null })
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          ...options,
          body: payload ? JSON.stringify(payload) : undefined,
        })

        if (!res.ok) {
          let errorMessage = `HTTP ${res.status}`
          try {
            const data = await res.json()
            errorMessage = data.error || errorMessage
          } catch {
            // Ignore JSON parse errors
          }
          throw new Error(errorMessage)
        }

        const data = await res.json()
        setState({ data, loading: false, error: null })
        return data
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred'
        setState({ data: null, loading: false, error: errorMessage })
        throw err
      }
    },
    [url]
  )

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
  }, [])

  return { ...state, mutate, reset }
}
