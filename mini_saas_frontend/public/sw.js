/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope

const CACHE_NAME = 'billzo-v1'
const OFFLINE_URL = '/offline.html'

const API_ENDPOINTS = [
  '/api/merchant/invoices/create',
  '/api/merchant/customer',
]

interface QueuedRequest {
  id: string
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  timestamp: number
}

const queues: Map<string, QueuedRequest[]> = new Map()

self.addEventListener('install', (event) => {
  console.log('[SW] Installing...')
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...')
  event.waitUntil(clients.claim())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'POST') return
  if (!API_ENDPOINTS.some(endpoint => url.pathname.includes(endpoint))) return
  if (!navigator.onLine) {
    event.respondWith(queueRequest(request))
    return
  }
})

self.addEventListener('sync', (event) => {
  console.log('[SW] Sync event:', event.tag)
  
  if (event.tag.startsWith('billzo-sync-')) {
    event.waitUntil(syncQueue(event.tag.replace('billzo-sync-', '')))
  }
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SYNC_QUEUE') {
    const queue = event.data.queue || 'default'
    syncQueue(queue)
  }
})

async function queueRequest(request: Request): Promise<Response> {
  const queueName = 'pending'
  
  const queuedRequest: QueuedRequest = {
    id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    method: request.method,
    url: request.url,
    headers: {},
    body: undefined,
    timestamp: Date.now(),
  }

  for (const [key, value] of request.headers.entries()) {
    queuedRequest.headers[key] = value
  }

  try {
    queuedRequest.body = await request.text()
  } catch {}

  const existing = queues.get(queueName) || []
  existing.push(queuedRequest)
  queues.set(queueName, existing)

  try {
    await self.registration.sync.register(`billzo-sync-${queueName}`)
  } catch (error) {
    console.log('[SW] Background sync not supported, using periodic sync')
  }

  return new Response(JSON.stringify({
    success: true,
    queued: true,
    message: 'Request queued for sync when online',
    requestId: queuedRequest.id,
  }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' }
  })
}

async function syncQueue(queueName: string): Promise<void> {
  if (!navigator.onLine) {
    console.log('[SW] Offline, skipping sync')
    return
  }

  const queue = queues.get(queueName) || []
  if (queue.length === 0) {
    console.log('[SW] Queue empty, nothing to sync')
    return
  }

  console.log(`[SW] Syncing ${queue.length} requests from ${queueName}`)

  const failed: QueuedRequest[] = []

  for (const request of queue) {
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      })

      if (response.ok) {
        console.log(`[SW] Synced: ${request.id}`)
      } else {
        console.warn(`[SW] Failed: ${request.id} - ${response.status}`)
        failed.push(request)
      }
    } catch (error) {
      console.error(`[SW] Network error for ${request.id}:`, error)
      failed.push(request)
    }
  }

  queues.set(queueName, failed)

  if (failed.length > 0) {
    console.warn(`[SW] ${failed.length} requests failed to sync`)
  } else {
    console.log('[SW] All requests synced successfully')
  }
}

self.addEventListener('periodicSync', (event) => {
  console.log('[SW] Periodic sync:', event.tag)
  
  if (event.tag === 'billzo-sync') {
    event.waitUntil(syncAllQueues())
  }
})

async function syncAllQueues(): Promise<void> {
  for (const queueName of queues.keys()) {
    await syncQueue(queueName)
  }
}

export {}