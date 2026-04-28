import { useState, useCallback, useEffect, useRef } from 'react'

interface QueuedInvoice {
  id: string
  key: string
  data: any
  createdAt: number
  status: 'pending' | 'syncing' | 'failed'
  retryCount: number
}

interface OfflinePOSState {
  isOnline: boolean
  pendingCount: number
  lastSyncTime: number | null
}

// Generate unique idempotency key
function generateIdempotencyKey(): string {
  return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

const DB_NAME = 'billzo_offline'
const STORE_NAME = 'invoice_queue'
const DB_VERSION = 1

// IndexedDB helper
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

export function useOfflinePOS() {
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const dbRef = useRef<IDBDatabase | null>(null)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize DB and check online status
  useEffect(() => {
    async function init() {
      // Check online status
      setIsOnline(navigator.onLine)
      
      const handleOnline = () => {
        setIsOnline(true)
        syncPendingInvoices()
      }
      const handleOffline = () => setIsOnline(false)
      
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
      
      // Open IndexedDB
      try {
        dbRef.current = await openDB()
        await updatePendingCount()
      } catch (e) {
        console.error('Failed to open IndexedDB:', e)
      }
      
      return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }
    
    init()
  }, [])

  // Update pending count from IndexedDB
  async function updatePendingCount(): Promise<number> {
    if (!dbRef.current) return 0
    
    return new Promise((resolve) => {
      const tx = dbRef.current!.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.count()
      
      request.onsuccess = () => {
        const count = request.result
        setPendingCount(count)
        resolve(count)
      }
      request.onerror = () => resolve(0)
    })
  }

  // Queue invoice for offline sync
  const queueInvoice = useCallback(async (invoiceData: any): Promise<string> => {
    const idempotencyKey = generateIdempotencyKey()
    const queuedInvoice: QueuedInvoice = {
      id: `q_${Date.now()}`,
      key: idempotencyKey,
      data: invoiceData,
      createdAt: Date.now(),
      status: 'pending',
      retryCount: 0,
    }
    
    // Save to IndexedDB
    if (dbRef.current) {
      const tx = dbRef.current.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.add(queuedInvoice)
    }
    
    await updatePendingCount()
    
    // Try to sync immediately if online
    if (navigator.onLine) {
      syncPendingInvoices()
    }
    
    return idempotencyKey
  }, [])

  // Sync pending invoices with retry logic
  const syncPendingInvoices = useCallback(async (): Promise<void> => {
    if (!navigator.onLine || isSyncing) return
    
    setIsSyncing(true)
    
    try {
      if (!dbRef.current) {
        dbRef.current = await openDB()
      }
      
      const tx = dbRef.current.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const getAllRequest = store.getAll()
      
      getAllRequest.onsuccess = async () => {
        const pending: QueuedInvoice[] = getAllRequest.result || []
        
        for (const queued of pending) {
          // Mark as syncing
          queued.status = 'syncing'
          store.put(queued)
          
          try {
            // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
            const backoffMs = Math.min(1000 * Math.pow(2, queued.retryCount), 30000)
            
            // Attempt sync with idempotency key
            const response = await fetch('/api/merchant/invoices', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-idempotency-key': queued.key,
              },
              body: JSON.stringify(queued.data),
              // Add timeout
              signal: AbortSignal.timeout(10000),
            })
            
            if (response.ok) {
              // Success - remove from queue
              const deleteTx = dbRef.current!.transaction(STORE_NAME, 'readwrite')
              const deleteStore = deleteTx.objectStore(STORE_NAME)
              deleteStore.delete(queued.id)
              
              setLastSyncTime(Date.now())
            } else {
              // Server error - mark failed, increment retry
              queued.status = 'failed'
              queued.retryCount++
              
              if (queued.retryCount >= 5) {
                // Too many retries - remove to prevent infinite queue
                const deleteTx = dbRef.current!.transaction(STORE_NAME, 'readwrite')
                const deleteStore = deleteTx.objectStore(STORE_NAME)
                deleteStore.delete(queued.id)
                console.error('[OfflinePOS] Max retries reached, removing:', queued.id)
              } else {
                store.put(queued)
                // Schedule retry with backoff
                setTimeout(() => syncPendingInvoices(), backoffMs)
              }
            }
          } catch (error) {
            // Network error - mark as pending, schedule retry
            queued.status = 'pending'
            queued.retryCount++
            store.put(queued)
            
            const backoffMs = Math.min(1000 * Math.pow(2, queued.retryCount), 30000)
            retryTimeoutRef.current = setTimeout(() => syncPendingInvoices(), backoffMs)
          }
        }
        
        await updatePendingCount()
      }
    } catch (error) {
      console.error('[OfflinePOS] Sync error:', error)
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing])

  // Create invoice with offline-first safety
  const createInvoice = useCallback(async (invoiceData: any): Promise<{
    success: boolean
    invoiceId?: string
    whatsappLink?: string
    offline: boolean
    idempotencyKey: string
  }> => {
    const idempotencyKey = generateIdempotencyKey()
    
    // Try online first if connected
    if (navigator.onLine) {
      try {
        const response = await fetch('/api/merchant/invoices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-idempotency-key': idempotencyKey,
          },
          body: JSON.stringify(invoiceData),
          signal: AbortSignal.timeout(15000),
        })
        
        if (response.ok) {
          const result = await response.json()
          return {
            success: true,
            invoiceId: result.invoiceId,
            whatsappLink: result.whatsappLink,
            offline: false,
            idempotencyKey,
          }
        }
        
        // If server error, fall through to offline queue
        console.error('[OfflinePOS] Server error, queuing:', await response.text())
      } catch (error) {
        console.error('[OfflinePOS] Online failed:', error)
        // Fall through to offline queue
      }
    }
    
    // Queue for offline sync
    await queueInvoice(invoiceData)
    
    return {
      success: true, // Optimistically succeed
      invoiceId: idempotencyKey, // Temporary ID
      whatsappLink: undefined,
      offline: true,
      idempotencyKey,
    }
  }, [queueInvoice])

  // Clear sync timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
    }
  }, [])

  return {
    // State
    isOnline,
    pendingCount,
    lastSyncTime,
    isSyncing,
    
    // Actions
    createInvoice,
    syncPendingInvoices,
    queueInvoice,
  }
}
