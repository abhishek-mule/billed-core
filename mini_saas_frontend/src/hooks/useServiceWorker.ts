'use client'

import { useEffect, useState } from 'react'

interface UseServiceWorkerOptions {
  onSuccess?: () => void
  onUpdate?: () => void
}

export function useServiceWorker({ onSuccess, onUpdate }: UseServiceWorkerOptions = {}) {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [isSupported, setIsSupported] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      setIsSupported(false)
      return
    }

    setIsSupported(true)

    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[SW] Registered:', reg.scope)
        setRegistration(reg)

        if (reg.waiting && onUpdate) {
          onUpdate()
        }

        if (reg.active && onSuccess) {
          onSuccess()
        }

reg.onupdatefound = () => {
        const newWorker = reg.installing
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              onUpdate?.()
            }
          })
        }
      }
      })
      .catch((err) => {
        console.error('[SW] Registration failed:', err)
        setError(err.message)
      })
  }, [onSuccess, onUpdate])

  const requestSync = async (queue?: string) => {
    if (!registration) return false

    try {
      if ('sync' in registration) {
        await (registration as any).sync.register(`billzo-sync-${queue || 'default'}`)
        return true
      } else {
        const response = await fetch('/api/sync/trigger', {
          method: 'POST',
        })
        return response.ok
      }
    } catch (error) {
      console.error('[SW] Sync request failed:', error)
      return false
    }
  }

  const sendMessage = async (message: any) => {
    if (!registration?.active) return

    return new Promise((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = (event) => resolve(event.data)
      registration.active!.postMessage(message, [channel.port2])
    })
  }

  return {
    registration,
    isSupported,
    error,
    requestSync,
    sendMessage,
  }
}