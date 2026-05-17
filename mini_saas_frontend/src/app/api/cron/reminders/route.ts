export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { db, uuid } from '@/lib/billzo/db'
import type { Invoice } from '@/lib/billzo/types'

const GUPSHUP_API_KEY = process.env.GUPSHUP_API_KEY
const GUPSHUP_APP_NAME = process.env.GUPSHUP_APP_NAME || 'billzo'

const STAGE_HOURS: Record<string, number> = {
  t0_soft: 24,
  t24_nudge: 72,
  t72_strong: 120,
  t5_warning: 168,
}

const STAGE_ORDER: string[] = ['t0_soft', 't24_nudge', 't72_strong', 't5_warning']

function nextStage(stage: string): string {
  const idx = STAGE_ORDER.indexOf(stage)
  return STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.length - 1)]
}

async function sendWhatsAppMessage(phone: string, message: string, tenantId: string, invoiceId: string) {
  const cleanPhone = phone.replace(/\D/g, '')
  const withCountryCode = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`

  if (!GUPSHUP_API_KEY) {
    console.warn('[ReminderEngine] Gupshup API key not configured')
    await db().whatsappEvents.add({
      id: uuid(),
      tenantId,
      invoiceId,
      status: 'failed',
      failureReason: 'Gupshup API key not configured',
      occurredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    } as any)
    return false
  }

  try {
    const response = await fetch('https://api.gupshup.io/sm/api/v1/msg', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': GUPSHUP_API_KEY,
      },
      body: JSON.stringify({
        channel: 'whatsapp',
        source: GUPSHUP_APP_NAME,
        destination: withCountryCode,
        message: message,
      }),
    })

    const data = await response.json() as any

    if (response.ok && (data.status === 'submitted' || data.status === 'success')) {
      await db().whatsappEvents.add({
        id: uuid(),
        tenantId,
        invoiceId,
        providerMessageId: data.messageId || data.id,
        status: 'sent',
        occurredAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      } as any)
      return true
    } else {
      await db().whatsappEvents.add({
        id: uuid(),
        tenantId,
        invoiceId,
        status: 'failed',
        failureReason: data.message || 'Unknown error',
        occurredAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      } as any)
      return false
    }
  } catch (err: any) {
    console.error('[ReminderEngine] WhatsApp send error:', err)
    await db().whatsappEvents.add({
      id: uuid(),
      tenantId,
      invoiceId,
      status: 'failed',
      failureReason: err.message,
      occurredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    } as any)
    return false
  }
}

function buildMessage(invoice: Invoice, stage: string): string {
  const amount = invoice.total - (invoice.paidAmount || 0)
  const amountStr = `Rs ${amount.toLocaleString('en-IN')}`
  const name = invoice.customerName || 'Customer'
  const invId = invoice.id.slice(0, 8).toUpperCase()
  const dueDate = new Date(invoice.dueAt).toLocaleDateString('en-IN')
  const daysOverdue = Math.floor((Date.now() - new Date(invoice.dueAt).getTime()) / (1000 * 60 * 60 * 24))

  const messages: Record<string, string> = {
    t0_soft: `Namaste ${name}, your Billzo invoice for ${amountStr} is pending. Invoice: ${invId}. Please clear payment.`,
    t24_nudge: `Reminder ${name}: ${amountStr} still pending for your invoice ${invId}. Please pay today.`,
    t72_strong: `${name}, payment of ${amountStr} for invoice ${invId} is ${daysOverdue} days overdue. Please settle now.`,
    t5_warning: `FINAL NOTICE: ${name}, ${amountStr} is ${daysOverdue} days overdue on invoice ${invId}. Please pay immediately.`,
  }
  return messages[stage] || messages['t0_soft']
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
if (!cronSecret) {
  throw new Error('[BillZo] CRON_SECRET env var is required')
}

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date().toISOString()

    const allTenants = await db().tenants.toArray()
    let processed = 0
    let sent = 0

    for (const tenant of allTenants) {
      const dueInvoices = await db().invoices
        .where('tenantId')
        .equals(tenant.id)
        .filter((inv: any) =>
          inv.status !== 'paid' &&
          inv.nextRecoveryAt &&
          inv.nextRecoveryAt <= now
        )
        .toArray()

      for (const invoice of dueInvoices) {
        const stage = invoice.recoveryStage || 't0_soft'
        const message = buildMessage(invoice as Invoice, stage)

        const success = await sendWhatsAppMessage(
          invoice.customerPhone || '',
          message,
          tenant.id,
          invoice.id
        )

        const newStage = nextStage(stage)
        const nextHours = STAGE_HOURS[newStage] || 24
        const nextAt = new Date()
        nextAt.setHours(nextAt.getHours() + nextHours)

        await db().invoices.update(invoice.id, {
          recoveryStage: newStage as any,
          nextRecoveryAt: nextAt.toISOString(),
          lastWhatsAppStatus: success ? 'sent' : 'failed',
          reminderCount: (tenant.reminderCount || 0) + 1,
          updatedAt: new Date().toISOString(),
        })

        await db().recoveryAttempts.add({
          id: uuid(),
          tenantId: tenant.id,
          invoiceId: invoice.id,
          stage: newStage as any,
          tone: newStage === 't0_soft' ? 'soft' : newStage === 't24_nudge' ? 'nudge' : newStage === 't72_strong' ? 'strong' : 'warning',
          message,
          pdfUrl: invoice.pdfUrl || '',
          scheduledAt: now,
          sentAt: success ? now : undefined,
          status: success ? 'sent' : 'failed',
          createdAt: now,
          updatedAt: now,
        } as any)

        if (success) sent++
        processed++
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      sent,
      timestamp: now,
    })
  } catch (error) {
    console.error('[ReminderEngine] Error:', error)
    return NextResponse.json({ error: 'Failed to process reminders' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}