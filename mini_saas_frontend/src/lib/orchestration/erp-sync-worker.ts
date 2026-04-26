import { getCachedCredentials } from '@/lib/db/credentials'
import { createFrappeSalesInvoice } from '@/lib/integrations/frappe'
import { triggerInvoiceCreatedWorkflow } from '@/lib/integrations/n8n'
import { markErpWriteFailed, markErpWriteSuccess } from '@/lib/invoice/erp-sync'
import { queryOne, withTransaction } from '@/lib/db/client'
import { calculateInvoiceTotal } from '@/lib/gst'
import { formatPhone, generateCustomerId } from '@/lib/merchant'

export interface ErpSyncJob {
  tenantId: string
  invoiceId: string
  invoiceNumber: string
  payload: {
    customerPhone: string
    customerName?: string
    items: Array<{
      itemCode: string
      itemName?: string
      quantity: number
      rate: number
    }>
    notes?: string
  }
  summary: {
    subtotal: number
    taxAmount: number
    total: number
    items: Array<{
      itemCode: string
      itemName: string
      quantity: number
      rate: number
      amount: number
    }>
  }
  idempotencyKey?: string
}

export async function processErpSyncJob(job: ErpSyncJob): Promise<{ success: boolean; error?: string }> {
  const { tenantId, invoiceId, invoiceNumber, payload, summary } = job
  
  console.log(`[ERP Sync] Processing invoice ${invoiceNumber} for tenant ${tenantId}`)
  
  const creds = await getCachedCredentials(tenantId)
  const apiKey = creds?.apiKey || process.env.ERP_API_KEY || 'administrator'
  const apiSecret = creds?.apiSecret || process.env.ERP_API_SECRET || 'admin'
  const erpSite = creds?.erpSite || process.env.ERP_URL || 'http://localhost'

  try {
    // Create invoice in ERPNext
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

    // Update invoice as synced
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

    // Trigger WhatsApp notification workflow
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

    console.log(`[ERP Sync] Success: ${invoiceNumber} → ${frappeResult.invoiceId}`)
    return { success: true }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'ERP sync failed'
    
    console.error(`[ERP Sync] Failed: ${invoiceNumber}`, errorMessage)
    
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE invoices
         SET erp_sync_status = 'FAILED',
             erp_sync_error = $1,
             updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [errorMessage, invoiceId, tenantId]
      )
    })

    await markErpWriteFailed(tenantId, invoiceId, errorMessage, false)
    
    return { success: false, error: errorMessage }
  }
}