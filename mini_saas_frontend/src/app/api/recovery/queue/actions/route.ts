import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { writeOutboxEvent } from '@/lib/billzo/outbox'
import { recordPayment } from '@/lib/billzo/record-payment'
import { verifyRequest, validateJsonBody, validateRequired, errorResponse, logApiAccess } from '@/lib/billzo/api-middleware'
import { signUpiToken } from '@/lib/billzo/crypto'
import { sendDirectWhatsApp } from '@/lib/billzo/whatsapp-send-direct'
import { requireFeature } from '@/lib/auth/feature-gate'
import { EventType } from '@billzo/shared'
import type { PaymentSource } from '@billzo/shared'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''


const ACTIONS_WITH_OUTBOX_EVENT: Record<string, string> = {
  call: 'customer.called',
  mark_promise: 'promise.made',
  payment_reported: 'merchant.payment_reported',
  snooze: 'merchant.snoozed',
  mark_disputed: 'merchant.mark_disputed',
  mark_resolved: 'merchant.mark_closed',
}

const VALID_ACTIONS = new Set([...Object.keys(ACTIONS_WITH_OUTBOX_EVENT), 'send_reminder', 'record_payment'])

const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'

function formatAmount(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

function buildRecoveryMessage(input: {
  customerName: string
  amount: number
  businessName: string
  paymentUrl?: string | null
  pdfUrl?: string | null
  personalNote?: string | null
}): string {
  const lines = [
    `Dear ${input.customerName || 'Customer'},`,
    '',
    `This is a reminder for your pending amount of ${formatAmount(input.amount)}.`,
  ]

  if (input.paymentUrl) lines.push(`Pay here: ${input.paymentUrl}`)
  if (input.pdfUrl) lines.push(`Invoice PDF: ${input.pdfUrl}`)
  if (input.personalNote?.trim()) lines.push('', input.personalNote.trim())

  lines.push('', `Regards,\n${input.businessName || 'BillZo'}`)
  return lines.join('\n')
}

function buildConsolidatedMessage(input: {
  customerName: string
  totalOverdue: number
  invoices: Array<{ invoiceNumber: string; amount: number }>
  paymentUrl?: string | null
  businessName: string
  personalNote?: string | null
}): string {
  const lines = [
    `Hi ${input.customerName},`,
    '',
    `You have ${formatAmount(input.totalOverdue)} pending across ${input.invoices.length} invoice${input.invoices.length > 1 ? 's' : ''}.`,
    '',
  ]

  input.invoices.forEach(inv => {
    lines.push(`${inv.invoiceNumber}  ${formatAmount(inv.amount)}`)
  })

  lines.push('', `Please clear your dues.`)
  
  if (input.paymentUrl) lines.push(`Pay here: ${input.paymentUrl}`)
  if (input.personalNote?.trim()) lines.push('', input.personalNote.trim())

  lines.push('', `Regards,\n${input.businessName || 'BillZo'}`)
  return lines.join('\n')
}

function normalizePaymentSource(value: unknown): PaymentSource {
  if (value === 'cash' || value === 'razorpay' || value === 'bank_transfer' || value === 'cheque' || value === 'adjustment' || value === 'upi') {
    return value
  }
  return 'adjustment'
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const authResult = auth
    const tid = authResult.tenantId!
    const userId = authResult.userId

    // Mutations on the recovery queue require pro+ plan
    const gate = await requireFeature(tid, 'recovery_queue', 'POST')
    if (!gate.allowed) {
      return NextResponse.json({
        error: 'FEATURE_LOCKED',
        feature: 'recovery_queue',
        upgradeTo: 'pro',
      }, { status: 403 })
    }

    const bodyResult = await validateJsonBody(request)
    if (bodyResult.response) return bodyResult.response
    const body = bodyResult.data!

    const { caseId, action, payload } = body as {
      caseId: string
      action: string
      payload?: Record<string, any>
    }

    const required = validateRequired(body, ['caseId', 'action'])
    if (!required.valid) {
      return errorResponse(`Missing required fields: ${Object.keys(required.errors!).join(', ')}`, 400)
    }

    if (!VALID_ACTIONS.has(action)) {
      return errorResponse(`Invalid action: ${action}. Valid: ${Array.from(VALID_ACTIONS).join(', ')}`, 400)
    }

    logApiAccess(request, tid, 'system', `recovery.action:${action}`)

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Look up the case for customer info
    const { data: recoveryCase, error: caseErr } = await supabase
      .from('recovery_cases')
      .select('*, customers(customer_name, phone)')
      .eq('id', caseId)
      .eq('tenant_id', tid)
      .single()

    if (caseErr || !recoveryCase) {
      console.error('[QueueAction] Case lookup failed:', JSON.stringify({ caseErr, caseId, tenantId: tid, recoveryCase }))
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    // Track TTFA (Time To First Action)
    const ttfa = body.ttfa
    // ── record_payment: creates real payment record + emits payment.completed ──
    if (action === 'record_payment') {
      const amount = payload?.amount
      const source = normalizePaymentSource(payload?.source || payload?.method || 'cash')
      const invoiceId = payload?.invoiceId || await resolveInvoiceIdForCase(supabase, tid, recoveryCase)

      if (!amount || amount <= 0) {
        return NextResponse.json({ error: 'Valid amount required for record_payment' }, { status: 400 })
      }
      if (!invoiceId) {
        return NextResponse.json({ error: 'No open invoice found for this recovery case' }, { status: 404 })
      }

      const pmtResult = await recordPayment({
        tenantId: tid,
        invoiceId,
        customerId: recoveryCase.customer_id,
        amount,
        source,
        actor: 'merchant',
        evidence: { notes: payload?.notes || 'Recorded from recovery queue' },
        notes: payload?.notes,
      })

      if ('error' in pmtResult) {
        return NextResponse.json({ error: pmtResult.error }, { status: 500 })
      }

      await markCaseActivity(supabase, caseId)
      return NextResponse.json({
        success: true,
        action,
        invoiceId,
        paymentId: pmtResult.paymentId,
        refresh: ['recovery_queue', 'dashboard', 'invoice', 'customer'],
      })
    }

    // ── send_reminder: executable transport intent with consolidated customer message ──
    if (action === 'send_reminder') {
      // Get all unpaid invoices for this customer
      const { data: unpaidInvoices } = await supabase
        .from('invoices')
        .select('id, total, outstanding_amount, invoice_number, recovery_stage')
        .eq('tenant_id', tid)
        .eq('customer_id', recoveryCase.customer_id)
        .in('status', ['unpaid', 'overdue', 'partial'])
        .order('due_date', { ascending: true })

      if (!unpaidInvoices || unpaidInvoices.length === 0) {
        return NextResponse.json({ error: 'No open invoices found for this customer' }, { status: 404 })
      }

      const [{ data: tenant }] = await Promise.all([
        supabase
          .from('tenants')
          .select('company_name, upi_id')
          .eq('id', tid)
          .single(),
      ])

      // Use oldest invoice for payment link tracking
      const oldestInvoice = unpaidInvoices[0]
      const totalOverdue = unpaidInvoices.reduce(
        (sum, inv) => sum + (Number(inv.outstanding_amount ?? inv.total ?? 0)), 
        0
      )

      const upiId = tenant?.upi_id
      const paymentUrl = upiId
        ? `${appUrl}/pay/r/${signUpiToken({
            invoiceId: oldestInvoice.id,
            tenantId: tid,
            amount: totalOverdue,
            upiId,
            exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
          })}`
        : `${appUrl}/pay/${oldestInvoice.id}`
      
      const customerName = recoveryCase.customers?.customer_name || 'Customer'
      const businessName = tenant?.company_name || 'BillZo'
      const message = buildConsolidatedMessage({
        customerName,
        totalOverdue,
        invoices: unpaidInvoices.map(inv => ({
          invoiceNumber: inv.invoice_number || inv.id.slice(-8),
          amount: Number(inv.outstanding_amount ?? inv.total ?? 0)
        })),
        paymentUrl,
        businessName,
        personalNote: payload?.personalNote || payload?.notes || null,
      })

      // Immediate send for Gupshup; Baileys → queue via outbox for worker
      const directResult = await sendDirectWhatsApp(tid, recoveryCase.customer_id, message, {
        invoiceId: oldestInvoice.id,
        origin: 'manual_recovery_queue',
      })

      // Write outbox events for Baileys queuing / audit trail
      if (directResult.sentVia === 'baileys') {
        const eventId = await writeOutboxEvent({
          type: EventType.SEND_MESSAGE_INTENDED,
          tenantId: tid,
          entityId: oldestInvoice.id,
          payload: {
            customerId: recoveryCase.customer_id,
            invoiceId: oldestInvoice.id,
            caseId,
            message,
            paymentUrl,
            amount: totalOverdue,
            stage: recoveryCase.next_action_type || 'manual_reminder',
            origin: payload?.origin || 'manual_recovery_queue',
            consolidated: true,
            invoiceCount: unpaidInvoices.length,
          },
          correlationId: `recovery:${caseId}`,
          idempotencyKey: payload?.clientCorrelationId || `recovery:send:${caseId}:${new Date().toISOString().slice(0, 10)}`,
        })

        await writeOutboxEvent({
          type: EventType.RECOVERY_REMINDER_SENT,
          tenantId: tid,
          entityId: oldestInvoice.id,
          payload: {
            caseId,
            customerId: recoveryCase.customer_id,
            amount: totalOverdue,
            paymentUrl,
            queuedMessageEventId: eventId,
            channel: 'whatsapp',
            consolidated: true,
            invoiceCount: unpaidInvoices.length,
          },
          causationId: eventId,
          correlationId: `recovery:${caseId}`,
        })

        await markCaseActivity(supabase, caseId)

        return NextResponse.json({
          success: true,
          action,
          invoiceId: oldestInvoice.id,
          eventId,
          paymentUrl,
          totalOverdue,
          invoiceCount: unpaidInvoices.length,
          message: 'Reminder queued for delivery via WhatsApp',
          refresh: ['recovery_queue', 'dashboard', 'invoice', 'customer'],
        })
      }

      if (directResult.sentVia === 'gupshup') {
        await markCaseActivity(supabase, caseId)
        if (directResult.success) {
          return NextResponse.json({
            success: true,
            action,
            invoiceId: oldestInvoice.id,
            paymentUrl,
            totalOverdue,
            invoiceCount: unpaidInvoices.length,
            refresh: ['recovery_queue', 'dashboard', 'invoice', 'customer'],
          })
        }
        return NextResponse.json({
          success: false,
          error: directResult.error || 'Gupshup send failed',
          action,
          refresh: ['recovery_queue', 'dashboard', 'invoice', 'customer'],
        }, { status: 500 })
      }

      return NextResponse.json({
        success: false,
        error: directResult.error || 'No WhatsApp channel configured',
        action,
      }, { status: 400 })
    }

    // ── Standard outbox actions ──
    if (ACTIONS_WITH_OUTBOX_EVENT[action]) {
      const outboxPayload: Record<string, any> = {
        customerId: recoveryCase.customer_id,
        ...payload,
      }

      if (action === 'mark_promise') {
        outboxPayload.due_date = payload?.dueDate || null
      }

      if (action === 'snooze') {
        outboxPayload.snoozeDuration = payload?.snoozeDays || 3
      }

      await writeOutboxEvent({
        type: ACTIONS_WITH_OUTBOX_EVENT[action],
        tenantId: tid,
        entityId: caseId,
        payload: outboxPayload,
      })
      await markCaseActivity(supabase, caseId)
    }

    else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    // Log TTFA if provided
    if (ttfa && typeof ttfa === 'number') {
      console.log(`[TTFA] tenant=${tid} case=${caseId} action=${action} ms=${ttfa}`)
    }

    return NextResponse.json({ success: true, action, refresh: ['recovery_queue', 'dashboard'] })
  } catch (err: any) {
    console.error('[QueueAction] Action failed:', err)
    return NextResponse.json({ error: err.message || 'Action failed' }, { status: 500 })
  }
}

async function resolveInvoiceIdForCase(supabase: any, tenantId: string, recoveryCase: any): Promise<string | null> {
  if (recoveryCase.invoice_id) return recoveryCase.invoice_id

  const { data } = await supabase
    .from('invoices')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('customer_id', recoveryCase.customer_id)
    .in('status', ['unpaid', 'overdue', 'partial'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  return data?.id || null
}

async function markCaseActivity(supabase: any, caseId: string): Promise<void> {
  await supabase
    .from('recovery_cases')
    .update({ last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', caseId)
}
