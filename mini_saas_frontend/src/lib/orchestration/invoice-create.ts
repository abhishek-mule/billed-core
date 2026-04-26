import { PoolClient } from 'pg'
import { calculateInvoiceTotal } from '@/lib/gst'
import { formatPhone, generateCustomerId, MerchantInvoicePayload } from '@/lib/merchant'
import { queryOne, withTransaction } from '@/lib/db/client'
import { reserveInvoiceNumber, confirmInvoiceNumber } from '@/lib/invoice/sequencing'
import { createErpWriteAttempt } from '@/lib/invoice/erp-sync'
import { enqueueJobWithRetry, QUEUES } from '@/lib/queue'

interface StoredInvoice {
  id: string
  invoice_number: string
  erp_sync_status: 'PENDING' | 'SYNCED' | 'FAILED' | 'RETRY'
}

export interface CreateInvoiceResult {
  invoiceId: string
  invoiceNumber: string
  total: number
  syncStatus: 'SYNCED' | 'RETRY'
}

function buildIdempotencyKey(payload: MerchantInvoicePayload, explicitKey?: string): string {
  if (explicitKey && explicitKey.trim()) return explicitKey.trim()
  const itemSignature = payload.items
    .map((item) => `${item.itemCode}:${item.quantity}:${item.rate}`)
    .join('|')
  return `${formatPhone(payload.customerPhone)}:${itemSignature}`
}

async function insertPendingInvoice(args: {
  client: PoolClient
  tenantId: string
  invoiceId: string
  invoiceNumber: string
  payload: MerchantInvoicePayload
  total: ReturnType<typeof calculateInvoiceTotal>
}): Promise<void> {
  const { client, tenantId, invoiceId, invoiceNumber, payload, total } = args

  await client.query(
    `INSERT INTO invoices (
      id, tenant_id, invoice_number, customer_id, customer_name, status,
      subtotal, cgst, sgst, igst, total, line_items_json, tax_amount, notes,
      erp_sync_status, invoice_date
    ) VALUES (
      $1, $2, $3, $4, $5, 'FINALIZED',
      $6, $7, $8, $9, $10, $11::jsonb, $12, $13,
      'PENDING', NOW()
    )`,
    [
      invoiceId,
      tenantId,
      invoiceNumber,
      generateCustomerId(payload.customerPhone),
      payload.customerName || `Customer ${formatPhone(payload.customerPhone)}`,
      total.subtotal,
      total.taxAmount / 2,
      total.taxAmount / 2,
      0,
      total.total,
      JSON.stringify(total.items),
      total.taxAmount,
      payload.notes || '',
    ]
  )
}

export async function orchestrateInvoiceCreation(args: {
  tenantId: string
  payload: MerchantInvoicePayload
  idempotencyKey?: string
}): Promise<CreateInvoiceResult> {
  const { tenantId, payload, idempotencyKey } = args
  const idemKey = buildIdempotencyKey(payload, idempotencyKey)
  const reservation = await reserveInvoiceNumber(tenantId, idemKey)
  const invoiceNumber = reservation.invoiceNumber!

  const existing = await queryOne<StoredInvoice>(
    `SELECT id, invoice_number, erp_sync_status
     FROM invoices
     WHERE tenant_id = $1 AND invoice_number = $2`,
    [tenantId, invoiceNumber]
  )

  if (existing) {
    return {
      invoiceId: existing.id,
      invoiceNumber: existing.invoice_number,
      total: 0,
      syncStatus: existing.erp_sync_status === 'SYNCED' ? 'SYNCED' : 'RETRY',
    }
  }

  const summary = calculateInvoiceTotal(
    payload.items.map((item) => ({
      itemCode: item.itemCode,
      itemName: item.itemName || item.itemCode,
      quantity: item.quantity,
      rate: item.rate,
    }))
  )

  const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  
  // Insert invoice immediately (this is fast, <50ms)
  await withTransaction(async (client) => {
    await insertPendingInvoice({
      client,
      tenantId,
      invoiceId,
      invoiceNumber,
      payload,
      total: summary,
    })
  })

  await createErpWriteAttempt(tenantId, invoiceId, invoiceNumber)
  
  // Fire ERP sync in background (non-blocking)
  // This ensures response time is ~100ms instead of 500ms+
  enqueueJobWithRetry(QUEUES.erpSync, { 
    tenantId, 
    invoiceId, 
    invoiceNumber,
    payload,
    summary,
    idempotencyKey: idemKey,
  }, 3).catch((error) => {
    console.error('[Queue] Failed to enqueue ERP sync:', error)
  })

  // Confirm invoice number immediately
  await confirmInvoiceNumber(tenantId, invoiceNumber, idemKey)

  // Return immediately - ERP sync happens in background
  return {
    invoiceId,
    invoiceNumber,
    total: summary.total,
    syncStatus: 'RETRY',
  }
}
