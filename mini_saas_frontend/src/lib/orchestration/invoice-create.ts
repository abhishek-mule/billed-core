import { PoolClient } from 'pg'
import { calculateInvoiceTotal } from '@/lib/gst'
import { formatPhone, generateCustomerId, MerchantInvoicePayload } from '@/lib/merchant'
import { getCachedCredentials } from '@/lib/db/credentials'
import { queryOne, withTransaction } from '@/lib/db/client'
import { reserveInvoiceNumber, confirmInvoiceNumber } from '@/lib/invoice/sequencing'
import { createErpWriteAttempt, markErpWriteFailed, markErpWriteSuccess } from '@/lib/invoice/erp-sync'
import { enqueueJobWithRetry, QUEUES } from '@/lib/queue'
import { createFrappeSalesInvoice } from '@/lib/integrations/frappe'
import { triggerInvoiceCreatedWorkflow } from '@/lib/integrations/n8n'

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

  const creds = await getCachedCredentials(tenantId)
  const apiKey = creds?.apiKey || process.env.ERP_API_KEY || 'administrator'
  const apiSecret = creds?.apiSecret || process.env.ERP_API_SECRET || 'admin'
  const erpSite = creds?.erpSite || process.env.ERP_URL || 'http://localhost'

  try {
    const frappeResult = await createFrappeSalesInvoice(
      {
        siteUrl: erpSite,
        apiKey,
        apiSecret,
      },
      {
        customer: generateCustomerId(payload.customerPhone),
        customer_name: payload.customerName || `Customer ${formatPhone(payload.customerPhone)}`,
        company: erpSite,
        posting_date: new Date().toISOString().slice(0, 10),
        due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        items: summary.items.map((item) => ({
          item_code: item.itemCode,
          item_name: item.itemName,
          qty: item.quantity,
          rate: item.rate,
          amount: item.amount,
        })),
        custom_invoice_number: invoiceNumber,
        custom_tenant_id: tenantId,
        remarks: payload.notes || '',
        is_pos: 0,
        do_not_submit: false,
      }
    )

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE invoices
         SET erp_invoice_id = $1,
             erp_sync_status = 'SYNCED',
             erp_synced_at = NOW(),
             erp_sync_error = NULL,
             updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [frappeResult.invoiceId, invoiceId, tenantId]
      )
    })

    await markErpWriteSuccess(tenantId, invoiceId, frappeResult.invoiceId)
    await confirmInvoiceNumber(tenantId, invoiceNumber, idemKey, frappeResult.invoiceId)

    triggerInvoiceCreatedWorkflow({
      invoiceId,
      invoiceNumber,
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      tenantId,
      total: summary.total,
      timestamp: new Date().toISOString(),
    }).catch((error) => {
      console.warn('[n8n] invoice-created webhook failed', error)
    })

    return {
      invoiceId,
      invoiceNumber,
      total: summary.total,
      syncStatus: 'SYNCED' as const,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'ERP sync failed'

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE invoices
         SET erp_sync_status = 'RETRY',
             erp_sync_error = $1,
             updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [errorMessage, invoiceId, tenantId]
      )
    })

    await markErpWriteFailed(tenantId, invoiceId, errorMessage, true)
    await enqueueJobWithRetry(QUEUES.erpSync, { tenantId, invoiceId, invoiceNumber }, 3)
    await confirmInvoiceNumber(tenantId, invoiceNumber, idemKey)

    return {
      invoiceId,
      invoiceNumber,
      total: summary.total,
      syncStatus: 'RETRY',
    }
  }
}
