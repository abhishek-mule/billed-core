const DB_NAME = 'billzo_events'
const STORE_NAME = 'events'
const MAX_BATCH = 50
const FLUSH_INTERVAL = 30000

export interface BillingEvent {
  id: string
  tenantId: string
  userId?: string
  event: string
  properties?: Record<string, unknown>
  timestamp: string
  synced?: boolean
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
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

export async function trackEvent(
  tenantId: string,
  event: string,
  properties?: Record<string, unknown>,
  userId?: string
) {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    await store.add({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tenantId,
      userId,
      event,
      properties,
      timestamp: new Date().toISOString(),
      synced: false,
    })

    tx.oncomplete = () => db.close()
    tx.onerror = () => db.close()

    const count = await new Promise<number>((resolve, reject) => {
      const countReq = store.count()
      countReq.onsuccess = () => resolve(countReq.result)
      countReq.onerror = () => reject(countReq.error)
    })

    if (count >= MAX_BATCH) {
      flushEvents().catch(console.error)
    }
  } catch (err) {
    console.error('[Analytics] Failed to track event:', err)
  }
}

export async function flushEvents(): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    const events: BillingEvent[] = await new Promise((resolve, reject) => {
      const req = store.index('synced').getAll(IDBKeyRange.only(false))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    if (events.length === 0) return

    const response = await fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    })

    if (response.ok) {
      for (const evt of events) {
        await store.put({ ...evt, synced: true })
      }
    }

    tx.oncomplete = () => db.close()
    tx.onerror = () => db.close()
  } catch (err) {
    console.error('[Analytics] Flush failed:', err)
  }
}

if (typeof window !== 'undefined') {
  setInterval(() => {
    flushEvents().catch(console.error)
  }, FLUSH_INTERVAL)

  window.addEventListener('online', () => {
    flushEvents().catch(console.error)
  })
}

export const events = {
  invoice_created: 'invoice_created',
  invoice_paid: 'invoice_paid',
  reminder_sent: 'reminder_sent',
  reminder_read: 'reminder_read',
  payment_recovered: 'payment_recovered',
  plan_upgraded: 'plan_upgraded',
  plan_cancelled: 'plan_cancelled',
  onboarding_completed: 'onboarding_completed',
  login_google: 'login_google',
  login_email: 'login_email',
  login_phone: 'login_phone',
} as const