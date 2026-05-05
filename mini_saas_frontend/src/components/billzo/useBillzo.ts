'use client'

import { useCallback, useEffect, useState } from 'react'
import { getBillzoState } from '@/lib/billzo/actions'
import { scheduleBackgroundSync } from '@/lib/billzo/sync'

export type BillzoState = Awaited<ReturnType<typeof getBillzoState>>

export function useBillzo() {
  const [state, setState] = useState<BillzoState | null>(null)

  const refresh = useCallback(async () => {
    setState(await getBillzoState())
  }, [])

  useEffect(() => {
    refresh()
    scheduleBackgroundSync()
    const onChange = () => refresh()
    const onOnline = () => {
      scheduleBackgroundSync()
      refresh()
    }
    window.addEventListener('billzo:changed', onChange)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('billzo:changed', onChange)
      window.removeEventListener('online', onOnline)
    }
  }, [refresh])

  return { state, refresh }
}
