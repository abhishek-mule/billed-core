// authority:deferred-authoritative offline_sync_debt — Dexie→Supabase client sync
// Mutates authoritative tables (invoices, payments, tenants) without authority governance.
// Constitutional debt acknowledged — requires Dexie→authority ingress architecture.
import { createClient } from '@supabase/supabase-js'
import { db, notifyChanged } from './db'
import { getTenantId } from './tenant'
import type { QueueItem, Invoice, Payment, WhatsAppEvent, RecoveryCase, RecoveryAttribution } from './types'

const MAX_DELAY_MS = 10 * 60 * 1000
const RECONCILE_TABLES = ['invoices', 'payments', 'customers', 'whatsapp_events', 'recovery_cases', 'recovery_attributions'] as const
const RECONCILE_CACHE_KEY = 'billzo_last_reconciled_at'

function backoffMs(attempts: number) {
  const jitter = Math.floor(Math.random() * 750)
  return Math.min(1000 * 2 ** attempts + jitter, MAX_DELAY_MS)
}

/** Track the most recent server timestamp we've reconciled against. */
function getLastReconciledAt(): string {
  if (typeof window === 'undefined') return new Date(0).toISOString()
  return localStorage.getItem(RECONCILE_CACHE_KEY) || new Date(0).toISOString()
}

function setLastReconciledAt(ts: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(RECONCILE_CACHE_KEY, ts)
  }
}

export function scheduleBackgroundSync(delay = 250) {
  if (typeof window === 'undefined') return
  window.setTimeout(syncAndReconcile, delay)
}

export async function syncAndReconcile() {
  await syncPendingQueue()
  await reconcileFromServer()
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
    promise: 'promises',
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
        purchase_rate: payload.purchasePrice ?? 0,
        unit: payload.unit ?? null,
        created_at: payload.createdAt,
        updated_at: payload.updatedAt,
      }
    case 'invoice':
      return {
        id: payload.id,
        tenant_id: payload.tenantId,
        customer_id: payload.customerId || null,
        customer_name: payload.customerName,
        customer_phone: payload.customerPhone || null,
        subtotal: payload.total,
        total: payload.total,
        grand_total: payload.total,
        payment_mode: payload.paymentMode ?? (payload.paidAmount > 0 ? 'cash' : 'udhar'),
        payment_status: payload.status === 'paid' ? 'paid' : payload.paidAmount > 0 ? 'partial' : 'unpaid',
        status: payload.status?.toLowerCase() || 'unpaid',
        invoice_number: payload.invoiceNumber || payload.id,
        due_date: payload.dueAt ? String(payload.dueAt).slice(0, 10) : null,
        recovery_stage: payload.recoveryStage || 't0_soft',
        next_recovery_at: payload.nextRecoveryAt || null,
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
        customer_id: payload.customerId ?? null,
        amount: payload.amount ?? 0,
        payment_mode: payload.provider ?? 'cash',
        status: payload.status === 'success' ? 'paid' : (payload.status ?? 'pending'),
        razorpay_payment_id: payload.providerPaymentId ?? null,
        razorpay_order_id: payload.razorpayOrderId ?? null,
        collected_via: payload.collectedVia ?? 'manual',
        platform_fee: payload.platformFee ?? 0,
        notes: payload.notes ?? null,
        paid_at: payload.paidAt ?? null,
        created_at: payload.createdAt,
        updated_at: payload.updatedAt,
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
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
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
        const { error: waError } = await supabase.from('recovery_attempts').upsert(serializeQueuePayload(item) as Record<string, unknown>, { onConflict: 'id' })
        if (!waError) {
          await db().queue.update(item.id, { status: 'synced', lastError: undefined, updatedAt: new Date().toISOString() })
        } else {
          const nextAttemptAt = new Date(Date.now() + backoffMs(current.attempts + 1)).toISOString()
          await db().queue.update(item.id, { status: 'failed', lastError: waError.message, nextAttemptAt, updatedAt: new Date().toISOString() })
        }
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

/**
 * Pull latest invoice/payment state from Supabase and overwrite Dexie
 * when the server has a newer `updated_at` and no local changes are in flight.
 *
 * This closes the gap where server-side webhooks (Razorpay, WhatsApp status)
 * modify data while the client is offline.
 */
async function reconcileFromServer() {
  const tenantId = getTenantId()
  if (!tenantId) return
  if ((navigator as any).onLine === false) return

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return

  const supabase = createClient(url, key)
  const since = getLastReconciledAt()
  let newestTs = since

  // Check if an entity has pending local changes — if so, skip server update
  const hasPendingLocalChange = async (entityType: string, entityId: string): Promise<boolean> => {
    const pending = await db()
      .queue.where('[tenantId+status]')
      .anyOf([tenantId, 'pending'], [tenantId, 'failed'], [tenantId, 'conflict'])
      .filter((item) => item.entity === entityType && item.entityId === entityId)
      .count()
    return pending > 0
  }

  for (const table of RECONCILE_TABLES) {
    const { data: rows, error } = await supabase
      .from(table)
      .select('*')
      .eq('tenant_id', tenantId)
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })

    if (error || !rows || rows.length === 0) continue

    for (const row of rows) {
      if (row.updated_at > newestTs) newestTs = row.updated_at

      const entityType = table === 'invoices' ? 'invoice' : table === 'payments' ? 'payment' : table === 'customers' ? 'customer' : table === 'whatsapp_events' ? 'whatsapp_event' : table === 'recovery_cases' ? 'recovery_case' : 'recovery_attribution'
      if (await hasPendingLocalChange(entityType, row.id)) {
        continue
      }

      const dexieTable = table === 'invoices' ? db().invoices : table === 'payments' ? db().payments : table === 'customers' ? db().customers : table === 'whatsapp_events' ? db().whatsappEvents : table === 'recovery_cases' ? db().recoveryCases : db().recoveryAttributions
      const existing = await dexieTable.get(row.id)
      if (existing && 'updatedAt' in existing && (existing as any).updatedAt >= row.updated_at) continue

      if (table === 'invoices') {
        await db().invoices.put({
          id: row.id,
          tenantId: row.tenant_id,
          customerId: row.customer_id || '',
          customerName: row.customer_name || '',
          customerPhone: row.customer_phone || '',
          total: Number(row.total) || 0,
          paidAmount: Number(row.paid_amount) || 0,
          status: row.status === 'PAID' ? 'paid' : row.paid_amount > 0 ? 'partial' : row.status?.toLowerCase() === 'overdue' ? 'overdue' : 'unpaid',
          dueAt: row.due_date || new Date().toISOString(),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          syncStatus: 'synced',
          recoveryStage: (existing as Invoice)?.recoveryStage || 't0_soft',
          nextRecoveryAt: (existing as Invoice)?.nextRecoveryAt || row.due_date || new Date().toISOString(),
          paymentMode: row.payment_mode || (existing as Invoice)?.paymentMode || undefined,
          lastWhatsAppStatus: (existing as Invoice)?.lastWhatsAppStatus || 'queued',
          lastReminderAt: (existing as Invoice)?.lastReminderAt || row.last_reminder_at || null,
          reminderCount: (existing as Invoice)?.reminderCount || 0,
          pdfUrl: (existing as Invoice)?.pdfUrl || `/invoice/${row.id}`,
          version: (existing as Invoice)?.version || 1,
        } satisfies Invoice)
      } else if (table === 'payments') {
        await db().payments.put({
          id: row.id,
          tenantId: row.tenant_id,
          invoiceId: row.invoice_id || undefined,
          customerId: row.customer_id || undefined,
          provider: (row.payment_mode as Payment['provider']) || 'cash',
          providerPaymentId: row.razorpay_payment_id || undefined,
          razorpayOrderId: row.razorpay_order_id || undefined,
          amount: Number(row.amount) || 0,
          status: row.status === 'paid' ? 'success' : row.status === 'failed' ? 'failed' : 'pending',
          collectedVia: row.collected_via || 'manual',
          platformFee: Number(row.platform_fee) || 0,
          notes: row.notes || undefined,
          paidAt: row.paid_at || undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          syncStatus: 'synced',
        } satisfies Payment)
      } else if (table === 'customers') {
        await db().customers.put({
          id: row.id,
          tenantId: row.tenant_id,
          name: row.customer_name || row.name || '',
          phone: row.phone || '',
          whatsapp_number: (existing as any)?.whatsapp_number || row.phone || undefined,
          gstin: row.gstin || undefined,
          email: row.email || undefined,
          address: row.billing_address || row.address || undefined,
          automationMode: row.automation_mode || 'full_auto',
          defaultTone: 'english',
          opt_in: true,
          lastUsedAt: row.updated_at,
          invoiceCount: 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })
      } else if (table === 'whatsapp_events') {
        await db().whatsappEvents.put({
          id: row.id,
          tenantId: row.tenant_id,
          invoiceId: row.invoice_id || undefined,
          customerId: row.customer_id || undefined,
          phone: row.phone || undefined,
          direction: row.direction || 'outbound',
          status: row.status || 'queued',
          template: row.template || undefined,
          recoveryStage: row.recovery_stage || undefined,
          metadata: row.metadata || undefined,
          providerMessageId: row.provider_message_id || undefined,
          correlationId: row.correlation_id || undefined,
          serverAckAt: row.server_ack_at || undefined,
          deliveredAt: row.delivered_at || undefined,
          readAt: row.read_at || undefined,
          clickedAt: row.clicked_at || undefined,
          rateLimitedAt: row.rate_limited_at || undefined,
          timeToClickSeconds: row.time_to_click_seconds || undefined,
          occurredAt: row.occurred_at,
          createdAt: row.created_at,
        } satisfies WhatsAppEvent)
      } else if (table === 'recovery_cases') {
        await db().recoveryCases.put({
          id: row.id,
          tenantId: row.tenant_id,
          customerId: row.customer_id,
          customerName: row.customers?.customer_name || undefined,
          totalOutstanding: Number(row.total_outstanding) || 0,
          totalOverdue: Number(row.total_overdue) || 0,
          openInvoiceCount: row.open_invoice_count || 0,
          overdueInvoiceCount: row.overdue_invoice_count || 0,
          recoveryStateV2: row.recovery_state_v2 || 'active',
          engagementStateV2: row.engagement_state_v2 || undefined,
          nextActionType: row.next_action_type || undefined,
          nextActionDueAt: row.next_action_due_at || undefined,
          attentionScore: row.attention_score || 0,
          lastActivityAt: row.last_activity_at || undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        } satisfies RecoveryCase)
      } else if (table === 'recovery_attributions') {
        await db().recoveryAttributions.put({
          id: row.id,
          tenantId: row.tenant_id,
          invoiceId: row.invoice_id || undefined,
          paymentId: row.payment_id || undefined,
          amount: Number(row.amount) || 0,
          attributedAmount: Number(row.attributed_amount) || undefined,
          attributionType: row.attribution_type || 'last_touch',
          confidenceScore: Number(row.confidence_score) || 1.0,
          createdAt: row.created_at,
        } satisfies RecoveryAttribution)
      }
    }
  }

  if (newestTs > since) {
    setLastReconciledAt(newestTs)
    notifyChanged()
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
