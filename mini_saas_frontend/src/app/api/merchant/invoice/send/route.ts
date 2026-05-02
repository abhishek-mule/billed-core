import { NextResponse } from 'next/server'
import { withSessionAuth, SessionData } from '@/lib/session'
import { withCsrfProtection } from '@/lib/middleware/csrf'
import { queryOne } from '@/lib/db/client'
import { triggerInvoiceCreatedWorkflow } from '@/lib/integrations/n8n'
import {
  createInvoiceNotification,
  getInvoiceNotification,
  incrementNotificationAttempt,
  NotificationChannel,
  updateNotificationStatus,
} from '@/lib/db/notifications'

interface StoredInvoice {
  id: string
  invoice_number: string
  customer_name: string
  total: string
}

const COOLDOWN_SECONDS = 60

async function handleSendInvoice(request: Request, session: SessionData) {
  const { tenantId, role } = session
  if (!['owner', 'cashier', 'accountant'].includes(role)) {
    return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const invoiceId = String(body?.invoiceId || '')
    const channel = String(body?.channel || 'whatsapp') as NotificationChannel
    const forceResend = Boolean(body?.forceResend)

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: 'invoiceId is required' },
        { status: 400 }
      )
    }
    if (!['whatsapp', 'sms', 'email'].includes(channel)) {
      return NextResponse.json(
        { success: false, error: 'channel must be one of whatsapp, sms, email' },
        { status: 400 }
      )
    }

    const invoice = await queryOne<StoredInvoice>(
      `SELECT id, invoice_number, customer_name, total
       FROM invoices
       WHERE id = $1 AND tenant_id = $2`,
      [invoiceId, tenantId]
    )

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 })
    }

    const existingAttempt = await getInvoiceNotification(tenantId, invoice.id, channel)
    if (existingAttempt && !forceResend) {
      return NextResponse.json(
        {
          success: false,
          error: 'Already sent',
          lastAttempt: {
            id: existingAttempt.id,
            status: existingAttempt.status,
            attempt: existingAttempt.attempt,
            createdAt: existingAttempt.created_at,
            deliveredAt: existingAttempt.delivered_at,
          },
          cooldownSeconds: COOLDOWN_SECONDS,
        },
        { status: 409 }
      )
    }

    if (!existingAttempt) {
      await createInvoiceNotification({
        tenantId,
        invoiceId: invoice.id,
        channel,
        provider: channel === 'whatsapp' ? 'n8n' : channel,
        status: 'pending',
        metadata: { source: 'merchant.invoice.send' },
      })
    } else {
      await incrementNotificationAttempt({
        tenantId,
        invoiceId: invoice.id,
        channel,
        status: 'pending',
        metadata: { source: 'merchant.invoice.send', forceResend: true },
      })
    }

    await triggerInvoiceCreatedWorkflow({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      tenantId,
      customerName: invoice.customer_name,
      total: Number(invoice.total || 0),
      timestamp: new Date().toISOString(),
    })

    await updateNotificationStatus({
      tenantId,
      invoiceId: invoice.id,
      channel,
      status: 'sent',
      metadata: { source: 'merchant.invoice.send', eventQueued: true, sentAt: new Date().toISOString() },
    })

    return NextResponse.json({
      success: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      channel,
      message: 'Invoice send workflow triggered',
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to send invoice' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const handler = await withSessionAuth(handleSendInvoice)
  return withCsrfProtection(handler)(request)
}