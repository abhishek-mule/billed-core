import { query, queryOne } from '@/lib/db/client'

export type NotificationChannel = 'whatsapp' | 'sms' | 'email'
export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'failed'

export interface InvoiceNotification {
  id: string
  tenant_id: string
  invoice_id: string
  channel: NotificationChannel
  provider: string | null
  status: NotificationStatus
  attempt: number
  provider_message_id: string | null
  error_code: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  delivered_at: string | null
}

export async function getInvoiceNotification(
  tenantId: string,
  invoiceId: string,
  channel: NotificationChannel
): Promise<InvoiceNotification | null> {
  return queryOne<InvoiceNotification>(
    `SELECT *
     FROM invoice_notifications
     WHERE tenant_id = $1 AND invoice_id = $2 AND channel = $3`,
    [tenantId, invoiceId, channel]
  )
}

export async function createInvoiceNotification(args: {
  tenantId: string
  invoiceId: string
  channel: NotificationChannel
  provider?: string
  status: NotificationStatus
  metadata?: Record<string, unknown>
}): Promise<InvoiceNotification> {
  const rows = await query<InvoiceNotification>(
    `INSERT INTO invoice_notifications (
       tenant_id, invoice_id, channel, provider, status, attempt, metadata
     ) VALUES ($1, $2, $3, $4, $5, 1, $6::jsonb)
     RETURNING *`,
    [
      args.tenantId,
      args.invoiceId,
      args.channel,
      args.provider || null,
      args.status,
      JSON.stringify(args.metadata || {}),
    ]
  )
  return rows[0]
}

export async function incrementNotificationAttempt(args: {
  tenantId: string
  invoiceId: string
  channel: NotificationChannel
  status: NotificationStatus
  provider?: string
  metadata?: Record<string, unknown>
}): Promise<InvoiceNotification | null> {
  const rows = await query<InvoiceNotification>(
    `UPDATE invoice_notifications
     SET attempt = attempt + 1,
         status = $4::varchar,
         provider = COALESCE($5, provider),
         error_code = NULL,
         metadata = COALESCE($6::jsonb, metadata),
         delivered_at = CASE WHEN $4::varchar = 'delivered' THEN NOW() ELSE delivered_at END
     WHERE tenant_id = $1 AND invoice_id = $2 AND channel = $3
     RETURNING *`,
    [
      args.tenantId,
      args.invoiceId,
      args.channel,
      args.status,
      args.provider || null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ]
  )
  return rows[0] || null
}

export async function updateNotificationStatus(args: {
  tenantId: string
  invoiceId: string
  channel: NotificationChannel
  status: NotificationStatus
  providerMessageId?: string
  errorCode?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  await query(
    `UPDATE invoice_notifications
     SET status = $4::varchar,
         provider_message_id = COALESCE($5, provider_message_id),
         error_code = $6,
         metadata = COALESCE($7::jsonb, metadata),
         delivered_at = CASE WHEN $4::varchar = 'delivered' THEN NOW() ELSE delivered_at END
     WHERE tenant_id = $1 AND invoice_id = $2 AND channel = $3`,
    [
      args.tenantId,
      args.invoiceId,
      args.channel,
      args.status,
      args.providerMessageId || null,
      args.errorCode || null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ]
  )
}
