export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { estimateRecoverable } from '@/lib/billzo/recovery-read-model'
import { buildRecoveryDecision } from '@/lib/billzo/recovery-decision'

function arr_push(map: Map<string, any[]>, key: string, value: any) {
  const arr = map.get(key) || []
  arr.push(value)
  map.set(key, arr)
}

/**
 * Customer Workspace — the place a merchant actually works a single customer.
 * Aggregates recovery_cases + invoices + collection_actions + events +
 * whatsapp_events for one customer. No new infrastructure; pure reads.
 *
 * Single source of truth: outstanding / overdue amounts are ALWAYS derived from
 * invoices (total − paid_amount). recovery_cases is used only for *state*
 * (promise date, recovery state, broken promises, next action). This guarantees
 * the Customer Recovery Profile never disagrees with the Customers / Ledger view.
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

    // Recovery case — state only (amounts come from invoices below)
    const { data: rc } = await supabaseAdmin
      .from('recovery_cases')
      .select('id, recovery_state_v2, promise_to_pay_date, next_action_type, last_activity_at, updated_at, broken_promises, reminder_count')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Invoices (open / unpaid first) — single source of truth for amounts
    const { data: invoices } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, total, grand_total, paid_amount, outstanding_amount, status, due_date, created_at, customer_name')
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
      arr_push(waByAction, w.recovery_attempt_id, w)
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

    // ── Single source of truth: derive amounts from invoices ──
    const now = new Date()
    const invoiceOutstanding = (i: any) =>
      Number(i.outstanding_amount) > 0
        ? Number(i.outstanding_amount)
        : Math.max(0, (Number(i.grand_total || i.total || 0)) - (Number(i.paid_amount) || 0))
    const openInvoicesFor = (invoices || []).filter((i: any) => invoiceOutstanding(i) > 0)

    // ── Single authoritative decision, built once from recorded events ──
    // Build per-action delivery telemetry from whatsapp_events rows (statuses +
    // timestamps). Each action's evidence is grounded in real recorded events,
    // so the decision never claims a reminder was sent when it wasn't.
    const deliveryByAction: Record<string, any> = {}
    for (const [actionId, rows] of waByAction) {
      const sent = rows.filter((r: any) => r.status === 'sent').map((r: any) => r.occurred_at)
      const delivered = rows.filter((r: any) => r.delivered_at).map((r: any) => r.delivered_at)
      const read = rows.filter((r: any) => r.read_at).map((r: any) => r.read_at)
      const failed = rows.filter((r: any) => r.status === 'failed').map((r: any) => r.occurred_at)
      deliveryByAction[actionId] = {
        sentAt: sent.length ? sent[sent.length - 1] : undefined,
        deliveredAt: delivered.length ? delivered[delivered.length - 1] : undefined,
        readAt: read.length ? read[read.length - 1] : undefined,
        failedAt: failed.length ? failed[failed.length - 1] : undefined,
      }
    }

    const decision = buildRecoveryDecision({
      customerPhone: cust?.phone ?? null,
      invoices: (invoices || []).map((i: any) => ({
        id: i.id,
        number: i.invoice_number,
        outstanding: invoiceOutstanding(i),
        dueDate: i.due_date,
        status: i.status,
        createdAt: i.created_at,
      })),
      actions: actionRows.map((a: any) => ({
        id: a.id,
        actionType: a.actionType,
        status: a.status,
        invoiceIds: a.invoiceIds,
        completedAt: a.completedAt,
      })),
      deliveryByAction,
    })

    const openInvoices = openInvoicesFor
    const outstanding = openInvoices.reduce((s: number, i: any) => s + invoiceOutstanding(i), 0)
    const overdueInvs = openInvoices.filter(
      (i: any) => i.due_date && new Date(i.due_date) < now,
    )
    const overdue = overdueInvs.length > 0
      ? Math.max(...overdueInvs.map((i: any) =>
          Math.floor((now.getTime() - new Date(i.due_date).getTime()) / 86400000),
        ))
      : 0
    const promiseDate = rc?.promise_to_pay_date ?? null

    // Same estimate the dashboard uses — keeps per-customer "Expected today"
    // reconcilable with the aggregate "Today's Recovery Target".
    const { recoverableAmount, recoveryConfidence } = estimateRecoverable(
      outstanding,
      rc ?? {},
      cust ?? {},
    )

    // Fallback customer name from invoices when customers table has no matching row
    const invoiceCustomerName = (invoices || [])[0]?.customer_name || null

    return NextResponse.json({
      customer: cust ? {
        id: cust.id,
        name: cust.customer_name,
        phone: cust.phone,
        email: cust.email,
        tier: cust.customer_tier,
        gstin: cust.gstin,
      } : invoiceCustomerName ? {
        id: customerId,
        name: invoiceCustomerName,
        phone: '',
        email: null,
        tier: null,
        gstin: null,
      } : null,
      case: rc ? {
        id: rc.id,
        outstanding,
        overdue,
        state: rc.recovery_state_v2,
        promiseDate,
        brokenPromises: Number(rc.broken_promises || 0),
        lastPaymentAt: rc.last_activity_at,
        nextAction: rc.next_action_type,
        recoverableAmount,
        recoveryConfidence,
      } : (outstanding > 0 ? {
        id: 'virtual',
        outstanding,
        overdue,
        state: overdue > 0 ? 'overdue' : 'active',
        promiseDate: null,
        brokenPromises: 0,
        lastPaymentAt: null,
        nextAction: null,
        recoverableAmount,
        recoveryConfidence,
      } : null),
      invoices: (invoices || []).map((i: any) => ({
        id: i.id,
        number: i.invoice_number,
        total: invoiceOutstanding(i),
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
      decision,
    })
  } catch (err: any) {
    console.error('[CustomerWorkspace] failed', err)
    return NextResponse.json({ error: err?.message ?? 'unknown' }, { status: 500 })
  }
}
