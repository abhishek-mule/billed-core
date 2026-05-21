import { useState, useEffect, useRef, useCallback } from 'react'
import { db } from './db'

export function useLiveQuery<T>(
  queryFn: () => Promise<T>,
  deps: React.DependencyList = [],
  initialValue: T | undefined = undefined,
): { data: T | undefined; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | undefined>(initialValue)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  const runQuery = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await queryFn()
      if (mounted.current) {
        setData(result)
        setLoading(false)
      }
    } catch (e: any) {
      if (mounted.current) {
        setError(e?.message || 'Query failed')
        setLoading(false)
      }
    }
  }, deps)

  useEffect(() => {
    mounted.current = true
    runQuery()

    const handler = () => runQuery()
    window.addEventListener('billzo:changed', handler)

    return () => {
      mounted.current = false
      window.removeEventListener('billzo:changed', handler)
    }
  }, [runQuery])

  return { data, loading, error }
}

export function useLiveQueryState<T>(
  queryFn: () => Promise<T>,
  deps: React.DependencyList = [],
  initialValue: T | undefined = undefined,
): { data: T; loading: boolean; error: string | null } {
  const result = useLiveQuery(queryFn, deps, initialValue)
  return {
    data: (result.data ?? initialValue) as T,
    loading: result.loading,
    error: result.error,
  }
}
