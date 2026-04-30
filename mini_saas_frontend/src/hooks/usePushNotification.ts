import { useState, useEffect } from 'react'

interface PushSubscription {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

interface UsePushNotificationReturn {
  permission: NotificationPermission
  isSupported: boolean
  isSubscribed: boolean
  isLoading: boolean
  error: string | null
  requestPermission: () => Promise<boolean>
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
  sendTestNotification: () => Promise<void>
}

export function usePushNotification(): UsePushNotificationReturn {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)

  const isSupported = 'serviceWorker' in navigator && 'PushManager' in window

  useEffect(() => {
    if (!isSupported) return

    // Check current permission
    setPermission(Notification.permission)

    // Register service worker and check subscription
    async function init() {
      try {
        const reg = await navigator.serviceWorker.getRegistration()
        if (reg) {
          setRegistration(reg)
          const subscription = await reg.pushManager.getSubscription()
          setIsSubscribed(!!subscription)
        }
      } catch (err) {
        console.error('Failed to init push notifications:', err)
      }
    }

    init()
  }, [isSupported])

  const requestPermission = async (): Promise<boolean> => {
    if (!isSupported) {
      setError('Push notifications not supported')
      return false
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      
      if (result === 'granted') {
        await subscribe()
        return true
      } else {
        setError('Permission denied')
        return false
      }
    } catch (err) {
      setError('Failed to request permission')
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const subscribe = async (): Promise<void> => {
    if (!isSupported || permission !== 'granted') {
      setError('Permission not granted')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Register service worker if not already registered
      let reg = registration
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js')
        setRegistration(reg)
      }

      // Get existing subscription or create new one
      let subscription = await reg.pushManager.getSubscription()
      
      if (!subscription) {
        // Get VAPID public key from environment
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidPublicKey) {
          throw new Error('VAPID public key not configured')
        }

        // Convert VAPID key
        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey)
        
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey as any
        })
      }

      // Send subscription to server
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subscription }),
      })

      if (!response.ok) {
        throw new Error('Failed to save subscription')
      }

      setIsSubscribed(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to subscribe')
      console.error('Subscription failed:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const unsubscribe = async (): Promise<void> => {
    if (!registration) return

    setIsLoading(true)
    setError(null)

    try {
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()
        
        // Remove from server
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
      }
      
      setIsSubscribed(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unsubscribe')
      console.error('Unsubscribe failed:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const sendTestNotification = async (): Promise<void> => {
    if (!isSubscribed) {
      setError('Not subscribed to push notifications')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Test Notification',
          body: 'This is a test notification from BillZo!',
          icon: '/billZo_logo.png',
          badge: '/logo-icon.svg',
          data: {
            type: 'test',
            timestamp: Date.now()
          }
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send test notification')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send notification')
      console.error('Send notification failed:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return {
    permission,
    isSupported,
    isSubscribed,
    isLoading,
    error,
    requestPermission,
    subscribe,
    unsubscribe,
    sendTestNotification
  }
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}