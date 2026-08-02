import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { writeOutboxEvent } from '@/lib/billzo/outbox'
import { recordPayment } from '@/lib/billzo/record-payment'
import { verifyRequest, validateJsonBody, validateRequired, errorResponse, logApiAccess } from '@/lib/billzo/api-middleware'
import { signUpiToken } from '@/lib/billzo/crypto'
import { sendDirectWhatsApp } from '@/lib/billzo/whatsapp-send-direct'
import { requireFeature } from '@/lib/auth/feature-gate'
import { getEntitlement, emitUsageEvent } from '@/lib/billzo/feature-flags'
import { planPromiseFollowup } from '@/lib/recovery/planner'
import { EventType, PAYMENT_SOURCES } from '@billzo/shared'
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
  if (PAYMENT_SOURCES.includes(value as any)) {
    return value as PaymentSource
  }
  return 'cash'
}

/**
 * Send a WhatsApp reminder for a single recovery case. Used for both the
 * single-card action and bulk (loop) sends. Resolves its own case so callers
 * only need a caseId (+ optional customerId fallback).
 */
async function sendReminderForCase(ctx: {
  supabase: any
  tid: string
  caseId: string
  customerId?: string | null
  payload?: Record<string, any>
}): Promise<{
  ok?: boolean
  status?: number
  body?: any
}> {
  const { supabase, tid, caseId, customerId, payload = {} } = ctx

  // Resolve the recovery case (with synthetic fallback to a bare customer).
  let recoveryCase: any = null
  const { data: rc, error: caseErr } = await supabase
    .from('recovery_cases')
    .select('*, customers(customer_name, phone)')
    .eq('id', caseId)
    .eq('tenant_id', tid)
    .single()
  if (caseErr || !rc) {
    if (customerId) {
      const { data: cust } = await supabase
        .from('customers')
        .select('id, customer_name, phone')
        .eq('id', customerId)
        .eq('tenant_id', tid)
        .maybeSingle()
      if (cust) {
        recoveryCase = {
          id: caseId || null,
          customer_id: cust.id,
          customers: { customer_name: cust.customer_name, phone: cust.phone },
        }
      }
    }
    if (!recoveryCase) {
      return { status: 404, body: { error: 'Case not found' } }
    }
  } else {
    recoveryCase = rc
  }

  // Quota gate with SOFT LIMITS (warn at 90/95%, hard-disable past 110%).
  const { PLAN_LIMITS } = await import('@/lib/billzo/plan-limits')
  const { checkQuota, emitUsageEvent } = await import('@/lib/billzo/feature-flags')
  const ent = await getEntitlement(tid)
  const limit = ent ? PLAN_LIMITS[ent.planCode].reminders : 3
  const quota = await checkQuota(tid, 'reminders_sent', limit)
  if (limit > 0 && (quota.used / limit) * 100 >= 110) {
    return {
      status: 402,
      body: { error: 'QUOTA_EXCEEDED', feature: 'reminders', limit, used: quota.used, upgradeTo: 'pro' },
    }
  }

  // All unpaid invoices for this customer.
  const unpaidInvoices = await getUnpaidInvoices(supabase, tid, recoveryCase.customer_id)
  if (!unpaidInvoices || unpaidInvoices.length === 0) {
    return { status: 404, body: { error: 'No open invoices found for this customer' } }
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('company_name, upi_id')
    .eq('id', tid)
    .single()

  const oldestInvoice = unpaidInvoices[0]
  const reminderStage = oldestInvoice.recovery_stage || 't0_soft'
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
    invoices: unpaidInvoices.map((inv: any) => ({
      invoiceNumber: inv.invoice_number || inv.id.slice(-8),
      amount: Number(inv.outstanding_amount ?? inv.total ?? 0)
    })),
    paymentUrl,
    businessName,
    personalNote: payload.personalNote || payload.notes || null,
  })

  const directResult = await sendDirectWhatsApp(tid, recoveryCase.customer_id, message, {
    invoiceId: oldestInvoice.id,
    origin: payload.origin || 'manual_recovery_queue',
  })

  const commonRefresh = ['recovery_queue', 'dashboard', 'invoice', 'customer']
  const ok = {
    action: 'send_reminder',
    invoiceId: oldestInvoice.id,
    paymentUrl,
    totalOverdue,
    customerId: recoveryCase.customer_id,
    invoiceCount: unpaidInvoices.length,
    refresh: commonRefresh,
    quotaWarning: 'none' as const,
  }

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
        stage: reminderStage,
        origin: payload.origin || 'manual_recovery_queue',
        consolidated: true,
        invoiceCount: unpaidInvoices.length,
        messageType: 'reminder',
        trigger: 'manual',
        override: true,
      },
      correlationId: `recovery:${caseId}`,
      idempotencyKey: payload.clientCorrelationId || `recovery:send:${caseId}:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`,
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
    await emitUsageEvent(tid, 'reminders_sent', 1).catch(() => {})
    return { status: 200, body: { success: true, ...ok, eventId, message: 'Reminder queued for delivery via WhatsApp' } }
  }

  if (directResult.sentVia === 'gupshup' || directResult.sentVia === 'meta') {
    await markCaseActivity(supabase, caseId)
    if (directResult.success) {
      await emitUsageEvent(tid, 'reminders_sent', 1).catch(() => {})
      return { status: 200, body: { success: true, ...ok } }
    }
    return { status: 500, body: { success: false, error: directResult.error || 'WhatsApp send failed', ...ok } }
  }

  if (directResult.success === false) {
    return { status: 500, body: { success: false, error: directResult.error || 'WhatsApp send failed', ...ok } }
  }

  return { status: 400, body: { success: false, error: 'No WhatsApp channel configured' } }
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
      const status = gate.code === 'TENANT_NOT_FOUND' ? 404 : 403
      return NextResponse.json({
        error: gate.error,
        code: gate.code,
        message: gate.message || gate.error,
        feature: 'manual_reminders',
        upgradeTo: gate.upgradeTo || 'pro',
      }, { status })
    }

    const bodyResult = await validateJsonBody(request)
    if (bodyResult.response) return bodyResult.response
    const body = bodyResult.data!

    const { caseId, action, payload } = body as {
      caseId?: string
      action: string
      payload?: Record<string, any>
    }
    let customerId = (body as any).customerId as string | undefined

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
        const invoiceId = body.invoiceId || payload?.invoiceId
        if (invoiceId) {
          const { data: inv } = await supabase
            .from('invoices')
            .select('customer_id')
            .eq('id', invoiceId)
            .maybeSingle()
          customerId = inv?.customer_id || undefined
        }
      }
      if (customerId) {
        const { data: existingCase } = await supabase
          .from('recovery_cases')
          .select('*, customers(customer_name, phone)')
          .eq('tenant_id', tid)
          .eq('customer_id', customerId)
          .limit(1)
          .maybeSingle()
        recoveryCase = existingCase
      }
    } else {
      // Bulk send paths resolve each case inside sendReminderForCase, so a bare
      // caseId is not required here.
      const isBulkSend = action === 'send_reminder' &&
        Array.isArray(body.caseIds) && body.caseIds.length > 0
      if (!caseId) {
        if (!isBulkSend) {
          return errorResponse('caseId required for this action', 400)
        }
        recoveryCase = null
      } else {
      const { data: rc, error: caseErr } = await supabase
        .from('recovery_cases')
        .select('*, customers(customer_name, phone)')
        .eq('id', caseId)
        .eq('tenant_id', tid)
        .single()

      if (caseErr || !rc) {
        // Synthetic case (no recovery_case row yet) — fall back to customerId
        if (customerId) {
          const { data: cust } = await supabase
            .from('customers')
            .select('id, customer_name, phone')
            .eq('id', customerId)
            .eq('tenant_id', tid)
            .maybeSingle()
          if (cust) {
            recoveryCase = {
              id: caseId || null,
              customer_id: cust.id,
              customers: { customer_name: cust.customer_name, phone: cust.phone },
            }
          }
        }
        if (!recoveryCase) {
          console.error('[QueueAction] Case lookup failed:', JSON.stringify({ caseErr, caseId, tenantId: tid, rc }))
          return NextResponse.json({ error: 'Case not found' }, { status: 404 })
        }
      } else {
        recoveryCase = rc
      }
      }
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
// ── send_reminder: executable transport intent with consolidated customer message ──
    // Supports a single caseId (card action) OR a caseIds[] array (bulk select).
    if (action === 'send_reminder') {
      const rawCaseIds = body.caseIds as string[] | undefined
      const ids = rawCaseIds && rawCaseIds.length > 0
        ? rawCaseIds
        : (caseId ? [caseId] : [])

      if (ids.length === 0) {
        return errorResponse('caseId or caseIds required for send_reminder', 400)
      }

      // Aggregate results so the UI can tell the merchant how many went out.
      const results: Array<{ caseId: string; status?: number; success?: boolean; body?: any }> = []
      let anyFailed = false
      let quotaExceeded = false

      for (const cid of ids) {
        const res = await sendReminderForCase({
          supabase,
          tid,
          caseId: cid,
          customerId: customerId || body.customerIds?.[0],
          payload: { ...payload, origin: payload?.origin || 'recovery_queue' },
        })
        const isSuccess = res.body?.success === true
        if (!isSuccess && res.status === 402) quotaExceeded = true
        if (res.status && res.status >= 400) anyFailed = true

        results.push({ caseId: cid, status: res.status || 200, success: isSuccess, body: res.body || {} })
      }

      const succeeded = results.filter(r => r.success).length
      const singleMode = ids.length === 1
      const first = results[0]

      if (singleMode) {
        if (quotaExceeded) {
          return NextResponse.json({
            error: 'QUOTA_EXCEEDED',
            feature: 'reminders',
            limit: first?.body?.limit,
            used: first?.body?.used,
            upgradeTo: 'pro',
          }, { status: 402 })
        }
        if (first?.body?.success) {
          return NextResponse.json({ success: true, action, ...first.body })
        }
        return NextResponse.json({
          success: false,
          error: first?.body?.error || 'Reminder failed',
          action,
          refresh: ['recovery_queue', 'dashboard', 'invoice', 'customer'],
        }, { status: first?.status || 500 })
      }

      // Bulk mode → aggregate response.
      if (quotaExceeded && succeeded === 0) {
        return NextResponse.json({
          error: 'QUOTA_EXCEEDED',
          success: false,
          succeeded,
          failed: results.length,
          upgradeTo: 'pro',
        }, { status: 402 })
      }
      return NextResponse.json({
        success: true,
        action,
        bulk: true,
        total: results.length,
        succeeded,
        failed: results.length - succeeded,
        anyFailed,
        refresh: ['recovery_queue', 'dashboard', 'invoice', 'customer'],
      })
    }

    // ── schedule_reminder: collection_action is the canonical write model ──
    // The action (status='scheduled') is what the worker scheduler scans and
    // executes. invoice.next_recovery_at is convenience metadata for UI/reporting,
    // updated AFTER the action is created and cleared when the action completes.
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

      const effectiveCustomerId = recoveryCase?.customer_id || customerId || null

      // Idempotency guard: prevent duplicate reminders from double-clicks,
      // browser retries, refresh/resubmit, or API retries. Key on tenant +
      // invoice + action_type + active status.
      const { data: existingAction } = await supabase
        .from('collection_actions')
        .select('id, scheduled_at')
        .eq('tenant_id', tid)
        .eq('action_type', 'reminder')
        .in('status', ['scheduled', 'processing', 'in_progress'])
        .contains('invoice_ids', [invoiceId])
        .limit(1)
        .maybeSingle()

      if (existingAction) {
        return NextResponse.json({
          success: true,
          action,
          invoiceId,
          alreadyScheduled: true,
          actionId: existingAction.id,
          dueDate,
          repeat: payload?.repeat || 'once',
          refresh: ['recovery_queue', 'dashboard', 'invoice', 'customer'],
        })
      }

      // 1. Insert the collection_action (source of truth for the scheduler).
      const actionId = `CA_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      const { error: insertErr } = await supabase
        .from('collection_actions')
        .insert({
          id: actionId,
          tenant_id: tid,
          customer_id: effectiveCustomerId,
          invoice_ids: [invoiceId],
          action_type: 'reminder',
          status: 'scheduled',
          source: 'merchant',
          trigger_type: 'MANUAL',
          template_name: payload?.templateName || 'payment_reminder',
          provider: 'whatsapp',
          scheduled_at: dueDate,
          max_attempts: 3,
          reason: 'Manually scheduled reminder',
          metadata: {
            origin: 'manual_schedule',
            repeat: payload?.repeat || 'once',
            notes: payload?.notes || null,
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

      if (insertErr) {
        console.error('[QueueAction] schedule_reminder collection_action insert failed:', insertErr)
        return NextResponse.json({ error: 'Failed to schedule reminder' }, { status: 500 })
      }

      // 2. Convenience metadata on the invoice — derived from, not authoritative
      //    over, the collection_action.
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

      // Create recovery case if one doesn't exist (requires a customerId)
      let effectiveCaseId = recoveryCase?.id
      if (!effectiveCaseId && customerId) {
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
          customerId: recoveryCase?.customer_id || customerId || null,
          invoiceId,
          dueDate,
          repeat: payload?.repeat || 'once',
          notes: payload?.notes || null,
          origin: 'manual_schedule',
          actionId,
        },
        correlationId: `recovery:${recoveryCase?.id || invoiceId}`,
      })

      return NextResponse.json({
        success: true,
        action,
        invoiceId,
        actionId,
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
        // Promise made → schedule a promise follow-up action automatically.
        if (payload?.dueDate && recoveryCase?.customer_id) {
          await planPromiseFollowup({
            tenantId: tid,
            customerId: recoveryCase.customer_id,
            invoiceIds: body.invoiceId ? [body.invoiceId] : [],
            promiseDate: new Date(payload.dueDate),
            reason: 'promise_made',
          }).catch((e) => console.error('[QueueAction] promise follow-up failed', e))
        }
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
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}

async function resolveInvoiceIdForCase(supabase: any, tenantId: string, recoveryCase: any): Promise<string | null> {
  if (recoveryCase.invoice_id) return recoveryCase.invoice_id

  const { data } = await supabase
    .from('invoices')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('customer_id', recoveryCase.customer_id)
    .in('status', ['issued', 'partial', 'draft'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  return data?.id || null
}

async function getUnpaidInvoices(supabase: any, tenantId: string, customerId: string): Promise<any[]> {
  const { data: allInvoices } = await supabase
    .from('invoices')
    .select('id, total, paid_amount, outstanding_amount, invoice_number, recovery_stage')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .order('due_date', { ascending: true })

  return (allInvoices || []).filter((inv: any) =>
    Number(inv.outstanding_amount ?? (inv.total ?? 0) - (inv.paid_amount ?? 0)) > 0)
}

async function markCaseActivity(supabase: any, caseId: string | undefined): Promise<void> {
  if (!caseId) return
  await supabase
    .from('recovery_cases')
    .update({ last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', caseId)
}
