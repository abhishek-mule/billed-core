import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
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

const VALID_ACTIONS = new Set([...Object.keys(ACTIONS_WITH_OUTBOX_EVENT), 'send_reminder', 'record_payment', 'schedule_reminder'])

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

    // Sending manual reminders is a starter+ feature; other actions (record_payment etc.) fall under manual_reminders too
    const gate = await requireFeature(tid, 'manual_reminders', 'POST')
    if (!gate.allowed) {
      return NextResponse.json({
        error: 'FEATURE_LOCKED',
        feature: 'manual_reminders',
        upgradeTo: 'pro',
      }, { status: 403 })
    }

    const bodyResult = await validateJsonBody(request)
    if (bodyResult.response) return bodyResult.response
    const body = bodyResult.data!

    const { caseId, customerId, action, payload } = body as {
      caseId?: string
      customerId?: string
      action: string
      payload?: Record<string, any>
    }

    if (!action) {
      return errorResponse('Missing required field: action', 400)
    }

    if (!VALID_ACTIONS.has(action)) {
      return errorResponse(`Invalid action: ${action}. Valid: ${Array.from(VALID_ACTIONS).join(', ')}`, 400)
    }

    logApiAccess(request, tid, 'system', `recovery.action:${action}`)

    const supabase = createClient(supabaseUrl, supabaseKey)

    // schedule_reminder resolves case by customerId (send page may not have caseId yet)
    let recoveryCase: any = null
    if (action === 'schedule_reminder') {
      if (!customerId) {
        return errorResponse('customerId required for schedule_reminder', 400)
      }
      const { data: existingCase } = await supabase
        .from('recovery_cases')
        .select('*, customers(customer_name, phone)')
        .eq('tenant_id', tid)
        .eq('customer_id', customerId)
        .limit(1)
        .maybeSingle()
      recoveryCase = existingCase
    } else {
      if (!caseId) {
        return errorResponse('caseId required for this action', 400)
      }
      const { data: rc, error: caseErr } = await supabase
        .from('recovery_cases')
        .select('*, customers(customer_name, phone)')
        .eq('id', caseId)
        .eq('tenant_id', tid)
        .single()

      if (caseErr || !rc) {
        console.error('[QueueAction] Case lookup failed:', JSON.stringify({ caseErr, caseId, tenantId: tid, rc }))
        return NextResponse.json({ error: 'Case not found' }, { status: 404 })
      }
      recoveryCase = rc
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

    // ── schedule_reminder: set next_recovery_at on invoice for worker to pick up ──
    if (action === 'schedule_reminder') {
      let dueDate = payload?.dueDate
      if (!dueDate && payload?.delayDays) {
        const d = new Date()
        d.setDate(d.getDate() + payload.delayDays)
        dueDate = d.toISOString()
      }
      if (!dueDate) {
        return NextResponse.json({ error: 'dueDate or delayDays required in payload' }, { status: 400 })
      }

      const invoiceId = body.invoiceId || payload?.invoiceId || recoveryCase?.invoice_id
      if (!invoiceId) {
        return NextResponse.json({ error: 'invoiceId required in payload or on recovery case' }, { status: 400 })
      }

      // Update next_recovery_at on the invoice
      const { error: updateErr } = await supabase
        .from('invoices')
        .update({
          next_recovery_at: dueDate,
          recovery_stage: 'scheduled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)
        .eq('tenant_id', tid)

      if (updateErr) {
        console.error('[QueueAction] schedule_reminder update failed:', updateErr)
        return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
      }

      // Create recovery case if one doesn't exist
      let effectiveCaseId = recoveryCase?.id
      if (!effectiveCaseId) {
        effectiveCaseId = crypto.randomUUID()
        const { error: createErr } = await supabase
          .from('recovery_cases')
          .insert({
            id: effectiveCaseId,
            tenant_id: tid,
            customer_id: customerId,
            status: 'open',
            invoice_count: 1,
            open_invoice_count: 1,
            total_outstanding: payload?.amount || 0,
            recovery_state_v2: 'active',
            engagement_state_v2: 'unseen',
            attention_score: Math.round((payload?.amount || 0) / 1000),
            version: 1,
            last_activity_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })

        if (createErr) {
          console.error('[QueueAction] schedule_reminder case create failed:', createErr)
        }
      }

      if (effectiveCaseId) {
        await markCaseActivity(supabase, effectiveCaseId)
      }

      // Write audit event
      await writeOutboxEvent({
        type: EventType.RECOVERY_REMINDER_SENT,
        tenantId: tid,
        entityId: invoiceId,
        payload: {
          customerId: recoveryCase?.customer_id || customerId,
          invoiceId,
          dueDate,
          repeat: payload?.repeat || 'once',
          notes: payload?.notes || null,
          origin: 'manual_schedule',
        },
        correlationId: `recovery:${recoveryCase?.id || invoiceId}`,
      })

      return NextResponse.json({
        success: true,
        action,
        invoiceId,
        dueDate,
        repeat: payload?.repeat || 'once',
        refresh: ['recovery_queue', 'dashboard', 'invoice', 'customer'],
      })
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

async function markCaseActivity(supabase: any, caseId: string | undefined): Promise<void> {
  if (!caseId) return
  await supabase
    .from('recovery_cases')
    .update({ last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', caseId)
}
