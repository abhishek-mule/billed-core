import { withTransaction, queryOne } from '@/lib/db/client'
import { getCachedCredentials } from '@/lib/db/credentials'
import { createFrappeSalesInvoice } from '@/lib/integrations/frappe'
import { markErpWriteFailed, markErpWriteSuccess, createErpWriteAttempt } from '@/lib/invoice/erp-sync'

interface StoredInvoice {
  id: string
  tenant_id: string
  invoice_number: string
  customer_id: string | null
  customer_name: string
  total: string
  notes: string | null
  line_items_json: Array<{
    itemCode?: string
    itemName?: string
    quantity?: number
    rate?: number
    amount?: number
  }>
  erp_sync_status: 'PENDING' | 'SYNCED' | 'FAILED' | 'RETRY'
}

export async function retryInvoiceSync(tenantId: string, invoiceId: string): Promise<{ status: 'SYNCED' | 'RETRY'; erpInvoiceId?: string }> {
  const invoice = await queryOne<StoredInvoice>(
    `SELECT id, tenant_id, invoice_number, customer_id, customer_name, total, notes, line_items_json, erp_sync_status
     FROM invoices
     WHERE id = $1 AND tenant_id = $2`,
    [invoiceId, tenantId]
  )

  if (!invoice) {
    throw new Error('Invoice not found')
  }

  if (invoice.erp_sync_status === 'SYNCED') {
    return { status: 'SYNCED' }
  }

  await createErpWriteAttempt(tenantId, invoice.id, invoice.invoice_number)

  const creds = await getCachedCredentials(tenantId)
  const apiKey = creds?.apiKey || process.env.ERP_API_KEY || 'administrator'
  const apiSecret = creds?.apiSecret || process.env.ERP_API_SECRET || 'admin'
  const erpSite = creds?.erpSite || process.env.ERP_URL || 'http://localhost'

  try {
    const itemRows = Array.isArray(invoice.line_items_json) ? invoice.line_items_json : []
    const items = itemRows.map((item) => ({
      item_code: item.itemCode || 'ITEM-UNKNOWN',
      item_name: item.itemName || item.itemCode || 'Item',
      qty: item.quantity || 1,
      rate: item.rate || 0,
      amount: item.amount || 0,
    }))

    const response = await createFrappeSalesInvoice(
      { siteUrl: erpSite, apiKey, apiSecret },
      {
        customer: invoice.customer_id || invoice.customer_name,
        customer_name: invoice.customer_name,
        company: erpSite,
        posting_date: new Date().toISOString().slice(0, 10),
        due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        items,
        custom_invoice_number: invoice.invoice_number,
        custom_tenant_id: tenantId,
        remarks: invoice.notes || '',
        is_pos: 0,
        do_not_submit: false,
      }
    )

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE invoices
         SET erp_invoice_id = $1, erp_sync_status = 'SYNCED', erp_synced_at = NOW(), erp_sync_error = NULL, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [response.invoiceId, invoiceId, tenantId]
      )
    })

    await markErpWriteSuccess(tenantId, invoiceId, response.invoiceId)
    return { status: 'SYNCED', erpInvoiceId: response.invoiceId }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'ERP retry failed'
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE invoices
         SET erp_sync_status = 'RETRY', erp_sync_error = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [errorMessage, invoiceId, tenantId]
      )
    })
    await markErpWriteFailed(tenantId, invoiceId, errorMessage, true)
    return { status: 'RETRY' }
  }
}
