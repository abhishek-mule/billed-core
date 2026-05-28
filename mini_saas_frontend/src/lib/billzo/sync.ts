import { createClient } from '@supabase/supabase-js'
import { db, notifyChanged } from './db'
import { getTenantId } from './tenant'
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

function serializeQueuePayload(item: QueueItem): Record<string, unknown> {
  const payload = item.payload as Record<string, any>

  switch (item.entity) {
    case 'customer':
      return {
        id: payload.id,
        tenant_id: payload.tenantId,
        customer_name: payload.name,
        phone: payload.phone,
        email: payload.email ?? null,
        gstin: payload.gstin ?? null,
        billing_address: payload.address ?? null,
        created_at: payload.createdAt,
        updated_at: payload.updatedAt,
      }
    case 'product':
      return {
        id: payload.id,
        tenant_id: payload.tenantId,
        item_name: payload.name,
        barcode: payload.barcode ?? null,
        hsn_code: payload.hsn ?? null,
        gst_rate: payload.gstRate ?? 0,
        stock_quantity: payload.stock ?? 0,
        low_stock_at: payload.lowStockAt ?? 10,
        rate: payload.salePrice ?? 0,
        standard_rate: payload.purchasePrice ?? 0,
        unit: payload.unit ?? null,
        created_at: payload.createdAt,
        updated_at: payload.updatedAt,
      }
    case 'invoice':
      return {
        id: payload.id,
        tenant_id: payload.tenantId,
        invoice_number: payload.id,
        customer_id: payload.customerId || null,
        customer_name: payload.customerName,
        customer_phone: payload.customerPhone || null,
        subtotal: payload.total,
        total: payload.total,
        grand_total: payload.total,
        payment_mode: payload.paymentMode ?? (payload.paidAmount > 0 ? 'cash' : 'udhar'),
        payment_status: payload.status === 'paid' ? 'PAID' : payload.paidAmount > 0 ? 'PARTIAL' : 'PENDING',
        status: payload.status?.toUpperCase?.() || 'ACTIVE',
        due_date: payload.dueAt ? String(payload.dueAt).slice(0, 10) : null,
        is_pos: !payload.customerId,
        created_at: payload.createdAt,
        updated_at: payload.updatedAt,
        idempotency_key: `${payload.tenantId}:${payload.id}`,
      }
    case 'invoice_item':
      return {
        id: payload.id,
        tenant_id: payload.tenantId,
        invoice_id: payload.invoiceId,
        product_id: payload.productId ?? null,
        item_name: payload.name,
        quantity: payload.qty,
        rate: payload.price,
        gst_rate: payload.gstRate ?? 0,
        amount: payload.lineTotal,
        created_at: payload.createdAt,
      }
    case 'purchase':
      return {
        id: payload.id,
        tenant_id: payload.tenantId,
        supplier_name: payload.supplier || null,
        supplier_gstin: payload.gstin || null,
        total: payload.amount ?? 0,
        grand_total: payload.amount ?? 0,
        source: payload.source ?? 'manual',
        created_at: payload.createdAt,
        updated_at: payload.updatedAt,
      }
    case 'payment':
      return {
        id: payload.id,
        tenant_id: payload.tenantId,
        invoice_id: payload.invoiceId ?? null,
        amount: payload.amount ?? 0,
        payment_mode: payload.provider ?? 'cash',
        razorpay_payment_id: payload.providerPaymentId ?? null,
        created_at: payload.createdAt,
      }
    default:
      return normalizePayload(payload) as Record<string, unknown>
  }
}

export async function syncPendingQueue() {
  if (typeof window === 'undefined') return
  if ((navigator as any).onLine === false) return
  if ((window as any).__billzoSyncing) return
  ;(window as any).__billzoSyncing = true

  try {
    const tenantId = getTenantId()
    if (!tenantId) return

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const due = new Date().toISOString()
    const pending = await db()
      .queue.where('[tenantId+status]')
      .anyOf([tenantId, 'pending'], [tenantId, 'failed'], [tenantId, 'conflict'])
      .filter((item) => item.nextAttemptAt <= due && item.attempts < 10)
      .sortBy('createdAt')

    if (pending.length === 0) return
    if (!url || !key) {
      await markDeferred(pending, 'Supabase env missing')
      return
    }

    const supabase = createClient(url, key)

    for (const item of pending) {
      const current = await db().queue.get(item.id)
      if (!current || current.status !== 'pending' && current.status !== 'failed' && current.status !== 'conflict') continue
      if (current.attempts >= 10) {
        await db().queue.update(item.id, { status: 'dead_letter', lastError: 'Max attempts reached', updatedAt: new Date().toISOString() })
        continue
      }

      await db().queue.update(item.id, { status: 'syncing', attempts: current.attempts + 1, updatedAt: new Date().toISOString() })

      if (item.action === 'send_whatsapp') {
        await db().queue.update(item.id, { status: 'synced', lastError: undefined, updatedAt: new Date().toISOString() })
        continue
      }

      const payload = serializeQueuePayload(item)
      const { error, status } = await supabase.from(tableFor(item)).upsert(payload as Record<string, unknown>, { onConflict: 'id' })
      if (!error) {
        await db().queue.update(item.id, { status: 'synced', lastError: undefined, updatedAt: new Date().toISOString() })
        continue
      }

      const conflict = status === 409 || error.code === '23505'
      const nextAttemptAt = new Date(Date.now() + backoffMs(current.attempts + 1)).toISOString()
      await db().queue.update(item.id, {
        status: conflict ? 'conflict' : 'failed',
        lastError: error.message,
        nextAttemptAt,
        updatedAt: new Date().toISOString(),
      })
    }
    notifyChanged()
  } finally {
    ;(window as any).__billzoSyncing = false
  }
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
