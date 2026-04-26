'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

export interface OfflineAction {
  id: string
  type: 'invoice:create' | 'invoice:update' | 'customer:create'
  payload: any
  enqueuedAt: number
  status: 'pending' | 'syncing' | 'failed'
  retryCount: number
  lastError?: string
}

const DB_NAME = 'billzo-offline'
const DB_VERSION = 1
const STORE_NAME = 'action-queue'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('type', 'type', { unique: false })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('enqueuedAt', 'enqueuedAt', { unique: false })
      }
    }
  })
}

export function useOfflineQueue() {
  const dbRef = useRef<IDBDatabase | null>(null)
  const [queue, setQueue] = useState<OfflineAction[]>([])
  const [isOnline, setIsOnline] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const syncInProgressRef = useRef(false)

  const loadQueue = useCallback(async () => {
    if (!dbRef.current) return

    return new Promise<void>((resolve) => {
      const tx = dbRef.current!.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.index('enqueuedAt').getAll()

      request.onsuccess = () => {
        const actions = (request.result as OfflineAction[]).sort(
          (a, b) => a.enqueuedAt - b.enqueuedAt
        )
        setQueue(actions)
        resolve()
      }
      request.onerror = () => resolve()
    })
  }, [])

  const initDb = useCallback(async () => {
    try {
      dbRef.current = await openDatabase()
      await loadQueue()
    } catch (error) {
      console.error('[OfflineQueue] Failed to init DB:', error)
    }
  }, [loadQueue])

  useEffect(() => {
    initDb()

    const handleOnline = () => {
      setIsOnline(true)
      syncQueue()
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setIsOnline(navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [initDb])

  const enqueue = useCallback(async (type: OfflineAction['type'], payload: any): Promise<string> => {
    const id = `${type.split(':')[0]}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    
    const action: OfflineAction = {
      id,
      type,
      payload,
      enqueuedAt: Date.now(),
      status: 'pending',
      retryCount: 0,
    }

    if (dbRef.current) {
      return new Promise((resolve, reject) => {
        const tx = dbRef.current!.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const request = store.add(action)

        request.onsuccess = () => {
          setQueue(prev => [...prev, action])
          resolve(id)
        }
        request.onerror = () => reject(request.error)
      })
    }

    return id
  }, [])

  const remove = useCallback(async (id: string) => {
    if (!dbRef.current) return

    return new Promise<void>((resolve) => {
      const tx = dbRef.current!.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(id)

      request.onsuccess = () => {
        setQueue(prev => prev.filter(a => a.id !== id))
        resolve()
      }
      request.onerror = () => resolve()
    })
  }, [])

  const updateStatus = useCallback(async (id: string, status: OfflineAction['status'], error?: string) => {
    if (!dbRef.current) return

    return new Promise<void>((resolve) => {
      const tx = dbRef.current!.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const getRequest = store.get(id)

      getRequest.onsuccess = () => {
        const action = getRequest.result as OfflineAction
        if (action) {
          action.status = status
          if (error) {
            action.lastError = error
            action.retryCount += 1
          }
          store.put(action)
          setQueue(prev => prev.map(a => a.id === id ? action : a))
        }
        resolve()
      }
      getRequest.onerror = () => resolve()
    })
  }, [])

  const syncQueue = useCallback(async () => {
    if (!isOnline || syncInProgressRef.current || queue.length === 0) return
    
    syncInProgressRef.current = true
    setIsSyncing(true)

    const pending = queue.filter(a => a.status === 'pending' || a.status === 'failed')

    for (const action of pending) {
      if (!isOnline) break

      try {
        await updateStatus(action.id, 'syncing')

        const endpoint = action.type === 'invoice:create' 
          ? '/api/merchant/invoices/create'
          : action.type === 'customer:create'
          ? '/api/merchant/customer'
          : '/api/unknown'

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-idempotency-key': `offline:${action.id}`,
          },
          body: JSON.stringify(action.payload),
        })

        if (response.ok) {
          await remove(action.id)
        } else if (response.status >= 500) {
          await updateStatus(action.id, 'failed', `Server error: ${response.status}`)
        } else {
          const errorData = await response.json().catch(() => ({}))
          await updateStatus(action.id, 'failed', errorData.error || `Error: ${response.status}`)
        }
      } catch (error) {
        await updateStatus(action.id, 'failed', error instanceof Error ? error.message : 'Network error')
      }
    }

    setIsSyncing(false)
    syncInProgressRef.current = false
    await loadQueue()
  }, [isOnline, queue, remove, updateStatus, loadQueue])

  const clearQueue = useCallback(async () => {
    if (!dbRef.current) return

    return new Promise<void>((resolve) => {
      const tx = dbRef.current!.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => {
        setQueue([])
        resolve()
      }
      request.onerror = () => resolve()
    })
  }, [])

  const pendingCount = queue.filter(a => a.status === 'pending').length
  const failedCount = queue.filter(a => a.status === 'failed').length

  return {
    enqueue,
    remove,
    updateStatus,
    syncQueue,
    clearQueue,
    queue,
    isOnline,
    isSyncing,
    pendingCount,
    failedCount,
  }
}