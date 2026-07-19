export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { recommend } from '@/lib/recovery/recommendation-engine'
import { scoreRelationship, deriveTrend } from '@/lib/recovery/relationship-score'

/**
 * Customer Workspace — the place a merchant actually works a single customer.
 * Aggregates recovery_cases + invoices + collection_actions + events +
 * whatsapp_events for one customer. No new infrastructure; pure reads.
 */
export async function GET(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const customerId = request.nextUrl.searchParams.get('customerId')
  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

  try {
    // Customer
    const { data: cust } = await supabaseAdmin
      .from('customers')
      .select('id, customer_name, phone, email, customer_tier, gstin, billing_address')
      .eq('id', customerId)
      .maybeSingle()

    // Recovery case
    const { data: rc } = await supabaseAdmin
      .from('recovery_cases')
      .select('id, total_outstanding, total_overdue, recovery_state_v2, promise_to_pay_date, broken_promises, last_payment_at, next_action_type, updated_at')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Invoices (open / unpaid first)
    const { data: invoices } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, grand_total, status, due_date, created_at')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(50)

    // Collection actions (full plan)
    const { data: actions } = await supabaseAdmin
      .from('collection_actions')
      .select('id, action_type, channel, template_name, status, scheduled_at, completed_at, trigger_type, invoice_ids')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('scheduled_at', { ascending: true })
      .limit(100)

    // Action lifecycle events
    const actionIds = (actions || []).map((a: any) => a.id)
    const { data: events } = actionIds.length
      ? await supabaseAdmin
          .from('collection_action_events')
          .select('action_id, event_type, to_status, created_at, payload')
          .eq('tenant_id', tenantId)
          .in('action_id', actionIds)
          .order('created_at', { ascending: false })
          .limit(200)
      : { data: [] as any[] }

    // WhatsApp read/delivery signals for the same actions
    const { data: wa } = actionIds.length
      ? await supabaseAdmin
          .from('whatsapp_events')
          .select('recovery_attempt_id, template, delivered_at, read_at, clicked_at, occurred_at, status')
          .eq('tenant_id', tenantId)
          .in('recovery_attempt_id', actionIds)
          .order('occurred_at', { ascending: false })
          .limit(200)
      : { data: [] as any[] }

    // Promise history (payment_promises table if present)
    const { data: promises } = await supabaseAdmin
      .from('payment_promises')
      .select('id, promise_date, promise_amount, status, created_at, note')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20)

    const eventByAction = new Map<string, any[]>()
    for (const e of events || []) {
      const arr = eventByAction.get(e.action_id) || []
      arr.push(e)
      eventByAction.set(e.action_id, arr)
    }

    const waByAction = new Map<string, any[]>()
    for (const w of wa || []) {
      const arr = waByAction.get(w.recovery_attempt_id) || []
      arr.push(w)
      waByAction.set(w.recovery_attempt_id, arr)
    }

    const actionRows = (actions || []).map((a: any) => {
      const evs = eventByAction.get(a.id) || []
      const waEvs = waByAction.get(a.id) || []
      const lastRead = waEvs.filter((w) => w.read_at).sort((x, y) => +new Date(y.read_at) - +new Date(x.read_at))[0]
      const lastDelivered = waEvs.filter((w) => w.delivered_at).sort((x, y) => +new Date(y.delivered_at) - +new Date(x.delivered_at))[0]
      const opens = waEvs.filter((w) => w.read_at).length
      return {
        id: a.id,
        actionType: a.action_type,
        channel: a.channel,
        templateName: a.template_name,
        status: a.status,
        triggerType: a.trigger_type,
        scheduledAt: a.scheduled_at,
        completedAt: a.completed_at,
        invoiceIds: a.invoice_ids || [],
        events: evs.map((e: any) => ({
          type: e.event_type,
          toStatus: e.to_status,
          at: e.created_at,
          detail: e.payload?.reason || e.payload?.channel || '',
        })),
        delivery: {
          deliveredAt: lastDelivered?.delivered_at ?? null,
          readAt: lastRead?.read_at ?? null,
          opens,
        },
      }
    })

    // Communication timeline = action events + whatsapp delivery signals, merged
    const comm: any[] = []
    for (const a of actionRows) {
      for (const e of a.events) comm.push({ at: e.at, kind: 'action', text: e.type, detail: e.detail, actionId: a.id })
      if (a.delivery.deliveredAt) comm.push({ at: a.delivery.deliveredAt, kind: 'wa', text: 'delivered', actionId: a.id })
      if (a.delivery.readAt) comm.push({ at: a.delivery.readAt, kind: 'wa', text: 'read', actionId: a.id })
    }
    comm.sort((x, y) => +new Date(y.at) - +new Date(x.at))

    const outstanding = Number(rc?.total_outstanding || 0)
    const overdue = Number(rc?.total_overdue || 0)
    const promiseDate = rc?.promise_to_pay_date ?? null

    // Recommended next step — shared deterministic engine (no AI).
    const allWa = (wa || [])
    const reminderWa = allWa.filter((w) => w.template)
    const lastDelivered = reminderWa.filter((w) => w.delivered_at).sort((x, y) => +new Date(y.delivered_at) - +new Date(x.delivered_at))[0]
    const lastRead = reminderWa.filter((w) => w.read_at).sort((x, y) => +new Date(y.read_at) - +new Date(x.read_at))[0]
    const undelivered = reminderWa.filter((w) => !w.delivered_at && w.status === 'failed').length
    const reminderCount = actionRows.filter((a) => a.actionType === 'reminder').length

    const recommended: any = (() => {
      if (!rc) return null
      return recommend({
        rc: {
          totalOutstanding: outstanding,
          totalOverdue: overdue,
          state: rc.recovery_state_v2,
          promiseToPayDate: promiseDate,
          brokenPromises: rc.broken_promises || 0,
          lastPaymentAt: rc.last_payment_at,
          nextActionType: rc.next_action_type,
        },
        signals: {
          lastReminderDeliveredAt: lastDelivered?.delivered_at ?? null,
          lastReminderReadAt: lastRead?.read_at ?? null,
          reminderCount,
          undeliveredReminders: undelivered,
        },
      })
    })()

    // Relationship Score — operational indicator (decoupled from recommendations).
    const promisesKept = (promises || []).filter((p: any) => p.status === 'kept' || p.status === 'fulfilled').length
    const promisesBroken = (promises || []).filter((p: any) => p.status === 'broken' || p.status === 'failed').length
    const remindersReadCount = allWa.filter((w: any) => w.read_at).length
    const remindersSentCount = actionRows.filter((a: any) => a.actionType === 'reminder').length
    const failedRemindersCount = allWa.filter((w: any) => w.status === 'failed' && !w.delivered_at).length
    const paidInvoices = (invoices || []).filter((i: any) => /^paid|settled/i.test(i.status || ''))
    const paidBeforeDue = paidInvoices.filter((i: any) => i.due_date && new Date(i.created_at) <= new Date(i.due_date)).length
    const paidWithin7 = paidInvoices.length // approximation until payment timestamps available

    const relationshipBase = scoreRelationship({
      paidBeforeDue,
      paidWithin7,
      promisesKept,
      promisesBroken,
      remindersRead: remindersReadCount,
      remindersSent: remindersSentCount,
      overdue30plus: overdue > 30 ? 1 : 0,
      requiredCalls: actionRows.filter((a: any) => a.actionType === 'call' && a.status === 'completed').length,
      failedReminders: failedRemindersCount,
      observations: (invoices?.length || 0) + (promises?.length || 0) + remindersSentCount,
    })
    const relationship = {
      ...relationshipBase,
      trend: deriveTrend(null, relationshipBase.score),
    }

    return NextResponse.json({
      customer: cust ? {
        id: cust.id,
        name: cust.customer_name,
        phone: cust.phone,
        email: cust.email,
        tier: cust.customer_tier,
        gstin: cust.gstin,
      } : null,
      case: rc ? {
        id: rc.id,
        outstanding,
        overdue,
        state: rc.recovery_state_v2,
        promiseDate,
        brokenPromises: rc.broken_promises || 0,
        lastPaymentAt: rc.last_payment_at,
        nextAction: rc.next_action_type,
      } : null,
      invoices: (invoices || []).map((i: any) => ({
        id: i.id,
        number: i.invoice_number,
        total: Number(i.grand_total || 0),
        status: i.status,
        dueDate: i.due_date,
        createdAt: i.created_at,
      })),
      actions: actionRows,
      promises: (promises || []).map((p: any) => ({
        id: p.id,
        promiseDate: p.promise_date,
        amount: Number(p.promise_amount || 0),
        status: p.status,
        createdAt: p.created_at,
        note: p.note,
      })),
      communication: comm.map((c) => ({
        at: c.at,
        kind: c.kind,
        text: c.text,
        detail: c.detail || '',
        actionId: c.actionId,
      })),
      recommended,
      relationship,
    })
  } catch (err: any) {
    console.error('[CustomerWorkspace] failed', err)
    return NextResponse.json({ error: err?.message ?? 'unknown' }, { status: 500 })
  }
}
