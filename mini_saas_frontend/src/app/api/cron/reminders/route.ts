export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { db, uuid } from '@/lib/billzo/db'
import type { Invoice } from '@/lib/billzo/types'

const STAGE_HOURS: Record<string, number> = {
  t0_soft: 24,
  t24_nudge: 72,
  t72_strong: 120,
  t5_warning: 168,
}

const STAGE_ORDER: string[] = ['t0_soft', 't24_nudge', 't72_strong', 't5_warning']

function nextStage(stage: string): string {
  const idx = STAGE_ORDER.indexOf(stage)
  return idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : stage
}

function buildMessage(invoice: Invoice, stage: string, tenantName: string): string {
  const amount = invoice.total - (invoice.paidAmount || 0)
  const amountStr = `₹${amount.toLocaleString('en-IN')}`
  const name = invoice.customerName || 'Customer'
  const invId = invoice.id.slice(0, 8).toUpperCase()
  const daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(invoice.dueAt).getTime()) / (1000 * 60 * 60 * 24)))

  const messages: Record<string, string> = {
    t0_soft: `Namaste ${name} ji, your invoice ${invId} for ${amountStr} from ${tenantName} is pending. Please pay when convenient. 🙏`,
    t24_nudge: `Hi ${name}, ${amountStr} for invoice ${invId} is still pending from ${tenantName}. Please clear it today. 📋`,
    t72_strong: `${name} ji, ${amountStr} for ${invId} is ${daysOverdue} days overdue. Please settle with ${tenantName} now.`,
    t5_warning: `${name} ji, final follow-up: ${amountStr} for ${invId} is ${daysOverdue} days overdue with ${tenantName}. Please pay immediately.`,
  }
  return messages[stage] || messages['t0_soft']
}

async function sendViaGupshup(config: any, to: string, message: string): Promise<boolean> {
  if (!config?.gupshupApiKey || !config?.gupshupAppName || !config?.sourceNumber) {
    console.log('[Collections] Simulating send:', { to, message })
    return true
  }

  const cleanPhone = to.replace(/\D/g, '').replace(/^91/, '')
  const payload = new URLSearchParams({
    api_key: config.gupshupApiKey,
    app_name: config.gupshupAppName,
    channel: 'whatsapp',
    source: config.sourceNumber,
    destination: cleanPhone,
    message: message,
    'message[0][type]': 'text',
    'message[0][text]': message,
  })

  try {
    const res = await fetch('https://api.gupshup.io/sm/api/v1/msg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
    })
    const data = await res.json() as any
    return res.ok && data.status === 'queued'
  } catch {
    return false
  }
}

async function triggerN8nCollections(tenants: any[]) {
  const n8nUrl = process.env.N8N_WEBHOOK_URL
  if (!n8nUrl || n8nUrl.includes('n8n.your-instance.com') || n8nUrl.includes('localhost')) {
    return false
  }

  const invoicesToProcess: any[] = []
  for (const tenant of tenants) {
    const config = tenant.whatsappConfig || {}
    const dueInvoices = await db().invoices
      .where('tenantId').equals(tenant.id)
      .filter((inv: any) =>
        inv.status !== 'paid' &&
        inv.nextRecoveryAt &&
        inv.nextRecoveryAt <= new Date().toISOString()
      )
      .toArray()

    for (const invoice of dueInvoices) {
      invoicesToProcess.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        invoiceId: invoice.id,
        customerName: invoice.customerName,
        customerPhone: invoice.customerPhone,
        total: invoice.total,
        paidAmount: invoice.paidAmount,
        stage: invoice.recoveryStage || 't0_soft',
        dueAt: invoice.dueAt,
        gupshupConfig: config,
      })
    }
  }

  if (invoicesToProcess.length === 0) return false

  try {
    await fetch(`${n8nUrl}/webhook/billzo-collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoices: invoicesToProcess, timestamp: new Date().toISOString() }),
    })
    return true
  } catch {
    return false
  }
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
    const n8nTriggered = await triggerN8nCollections(await db().tenants.toArray())

    if (n8nTriggered) {
      return NextResponse.json({
        success: true,
        mode: 'n8n',
        message: 'Collections delegated to n8n',
        timestamp: new Date().toISOString(),
      })
    }

    const allTenants = await db().tenants.toArray()
    let processed = 0
    let sent = 0

    for (const tenant of allTenants) {
      const config = tenant.whatsappConfig || {}
      const tenantName = tenant.name || 'BillZo'

      const dueInvoices = await db().invoices
        .where('tenantId').equals(tenant.id)
        .filter((inv: any) =>
          inv.status !== 'paid' &&
          inv.nextRecoveryAt &&
          inv.nextRecoveryAt <= new Date().toISOString()
        )
        .toArray()

      for (const invoice of dueInvoices) {
        const stage = invoice.recoveryStage || 't0_soft'
        const message = buildMessage(invoice as Invoice, stage, tenantName)

        const success = await sendViaGupshup(config, invoice.customerPhone || '', message)

        const newStage = nextStage(stage)
        const nextHours = STAGE_HOURS[newStage] || 24
        const nextAt = new Date()
        nextAt.setHours(nextAt.getHours() + nextHours)

        await db().invoices.update(invoice.id, {
          recoveryStage: newStage as any,
          nextRecoveryAt: nextAt.toISOString(),
          lastWhatsAppStatus: success ? 'sent' : 'failed',
          lastWhatsAppAt: new Date().toISOString(),
          reminderCount: (invoice.reminderCount || 0) + 1,
          updatedAt: new Date().toISOString(),
        })

        await db().whatsappEvents.add({
          id: uuid(),
          tenantId: tenant.id,
          invoiceId: invoice.id,
          customerId: invoice.customerId,
          phone: invoice.customerPhone,
          messageType: `reminder_${stage}`,
          status: success ? 'sent' : 'failed',
          occurredAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        })

        if (success) sent++
        processed++
      }
    }

    return NextResponse.json({
      success: true,
      mode: 'direct',
      processed,
      sent,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Collections] Error:', error)
    return NextResponse.json({ error: 'Failed to process collections' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}