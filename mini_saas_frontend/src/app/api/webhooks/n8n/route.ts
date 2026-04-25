import { NextResponse } from 'next/server'
import { withTransaction } from '@/lib/db/client'
import { markErpWriteFailed, markErpWriteSuccess } from '@/lib/invoice/erp-sync'
import { updateNotificationStatus } from '@/lib/db/notifications'
import { verifyHmacSignature } from '@/lib/webhook-auth/hmac'

interface N8nWebhookPayload {
  event: 'erp_sync_succeeded' | 'erp_sync_failed' | 'whatsapp_sent' | 'whatsapp_failed'
  tenantId: string
  invoiceId: string
  erpInvoiceId?: string
  error?: string
  channel?: 'whatsapp' | 'sms' | 'email'
  providerMessageId?: string
  metadata?: Record<string, unknown>
}

function isLegacyAuthorized(request: Request): boolean {
  const secret = process.env.N8N_WEBHOOK_SECRET
  if (!secret) return true
  const header = request.headers.get('x-n8n-secret')
  return header === secret
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-signature')
    const secret = process.env.N8N_WEBHOOK_SECRET

    if (secret) {
      const valid = verifyHmacSignature(rawBody, signature, secret)
      if (!valid && !isLegacyAuthorized(request)) {
        console.warn('[Webhook:n8n] Signature verification failed')
        return NextResponse.json({ success: false, error: 'Unauthorized webhook' }, { status: 401 })
      }
    }

    const payload = JSON.parse(rawBody) as N8nWebhookPayload
    if (!payload?.tenantId || !payload?.invoiceId || !payload?.event) {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 })
    }

    if (payload.event === 'erp_sync_succeeded') {
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE invoices
           SET erp_sync_status = 'SYNCED',
               erp_invoice_id = COALESCE($1, erp_invoice_id),
               erp_synced_at = NOW(),
               erp_sync_error = NULL,
               updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3`,
          [payload.erpInvoiceId || null, payload.invoiceId, payload.tenantId]
        )
      })
      await markErpWriteSuccess(payload.tenantId, payload.invoiceId, payload.erpInvoiceId || '')
    } else if (payload.event === 'erp_sync_failed') {
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE invoices
           SET erp_sync_status = 'RETRY',
               erp_sync_error = $1,
               updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3`,
          [payload.error || 'ERP sync failed', payload.invoiceId, payload.tenantId]
        )
      })
      await markErpWriteFailed(payload.tenantId, payload.invoiceId, payload.error || 'ERP sync failed', true)
    } else if (payload.event === 'whatsapp_sent') {
      await updateNotificationStatus({
        tenantId: payload.tenantId,
        invoiceId: payload.invoiceId,
        channel: payload.channel || 'whatsapp',
        status: 'delivered',
        providerMessageId: payload.providerMessageId,
        metadata: payload.metadata,
      })
    } else if (payload.event === 'whatsapp_failed') {
      await updateNotificationStatus({
        tenantId: payload.tenantId,
        invoiceId: payload.invoiceId,
        channel: payload.channel || 'whatsapp',
        status: 'failed',
        errorCode: payload.error || 'delivery_failed',
        metadata: payload.metadata,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Webhook handling failed' },
      { status: 500 }
    )
  }
}
