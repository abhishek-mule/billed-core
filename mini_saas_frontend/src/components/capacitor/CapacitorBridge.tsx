'use client'

import { useEffect } from 'react'
import { initCapacitorBridge, isNative } from '@/lib/capacitor/bridge'

export function CapacitorBridge() {
  useEffect(() => {
    if (isNative()) {
      void initCapacitorBridge()
    }
  }, [])

  return null
}