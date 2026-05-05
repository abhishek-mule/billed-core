import { createClient } from '@supabase/supabase-js'
import { db, notifyChanged } from './db'
import type { QueueItem } from './types'

const MAX_DELAY_MS = 10 * 60 * 1000

function backoffMs(attempts: number) {
  const jitter = Math.floor(Math.random() * 750)
  return Math.min(1000 * 2 ** attempts + jitter, MAX_DELAY_MS)
}

export function scheduleBackgroundSync(delay = 250) {
  if (typeof window === 'undefined') return
  window.setTimeout(syncPendingQueue, delay)
}

function tableFor(item: QueueItem) {
  const tables: Record<QueueItem['entity'], string> = {
    tenant: 'tenants',
    customer: 'customers',
    product: 'products',
    invoice: 'invoices',
    invoice_item: 'invoice_items',
    purchase: 'purchases',
    inventory_movement: 'inventory_movements',
    payment: 'payments',
    whatsapp_event: 'whatsapp_events',
    recovery_attempt: 'recovery_attempts',
  }
  return tables[item.entity]
}

export async function syncPendingQueue() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const due = new Date().toISOString()
  const pending = await db()
    .queue.where('status')
    .anyOf('pending', 'failed', 'conflict')
    .filter((item) => item.nextAttemptAt <= due)
    .sortBy('createdAt')

  if (pending.length === 0) return
  if (!url || !key) {
    await markDeferred(pending, 'Supabase env missing')
    return
  }

  const supabase = createClient(url, key, {
    global: {
      headers: {
        'x-billzo-idempotency-key': pending[0]?.idempotencyKey || '',
      },
    },
  })

  for (const item of pending) {
    await db().queue.update(item.id, { status: 'syncing', attempts: item.attempts + 1, updatedAt: new Date().toISOString() })

    if (item.action === 'send_whatsapp') {
      await db().queue.update(item.id, { status: 'synced', updatedAt: new Date().toISOString() })
      continue
    }

    const payload = normalizePayload(item.payload)
    const { error, status } = await supabase.from(tableFor(item)).upsert(payload as Record<string, unknown>, { onConflict: 'id' })
    if (!error) {
      await db().queue.update(item.id, { status: 'synced', lastError: undefined, updatedAt: new Date().toISOString() })
      continue
    }

    const conflict = status === 409 || error.code === '23505'
    const nextAttemptAt = new Date(Date.now() + backoffMs(item.attempts + 1)).toISOString()
    await db().queue.update(item.id, {
      status: conflict ? 'conflict' : 'failed',
      lastError: error.message,
      nextAttemptAt,
      updatedAt: new Date().toISOString(),
    })
  }
  notifyChanged()
}

async function markDeferred(items: QueueItem[], reason: string) {
  const nextAttemptAt = new Date(Date.now() + 30_000).toISOString()
  await Promise.all(
    items.map((item) =>
      db().queue.update(item.id, {
        status: 'failed',
        lastError: reason,
        nextAttemptAt,
        updatedAt: new Date().toISOString(),
      })
    )
  )
}

function normalizePayload(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload.map(normalizePayload)
  if (!payload || typeof payload !== 'object') return payload

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      normalizePayload(value),
    ])
  )
}
