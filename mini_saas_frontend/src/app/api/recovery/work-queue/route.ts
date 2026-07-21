export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

/**
 * Work Queue — the merchant's daily workbench, grouped by REQUIRED ACTION
 * (not DB status). Sections: needsCall, sendReminder, promiseFollowup,
 * scheduledLater, completedToday. Every field derived from existing tables.
 * No new infrastructure.
 */
export async function GET(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfDay = new Date(startOfDay.getTime() + 86400000)

    // ── Cases (for needs-call / reason derivation) ──
    const { data: cases } = await supabaseAdmin
      .from('recovery_cases')
      .select('id, customer_id, total_outstanding, total_overdue, recovery_state_v2, promise_to_pay_date, broken_promises, last_payment_at, next_action_type, open_invoice_count')
      .eq('tenant_id', tenantId)
      .gt('total_outstanding', 0)
      .in('recovery_state_v2', ['active', 'overdue', 'partial_payment', 'promised', 'disputed'])

    const caseByCustomer = new Map<string, any>((cases || []).map((c: any) => [c.customer_id, c] as [string, any]))

    // ── Single source of truth: derive amounts from invoices for every case ──
    const caseCustomerIds = [...new Set((cases || []).map((c: any) => c.customer_id))]
    const { data: invRows } = caseCustomerIds.length
      ? await supabaseAdmin
          .from('invoices')
          .select('customer_id, total, paid_amount, status, due_date')
          .eq('tenant_id', tenantId)
          .in('customer_id', caseCustomerIds)
          .in('status', ['unpaid', 'overdue', 'partial'])
      : { data: [] as any[] }
    const invGrouped = new Map<string, any[]>()
    for (const inv of invRows || []) {
      const arr = invGrouped.get(inv.customer_id) || []
      arr.push(inv)
      invGrouped.set(inv.customer_id, arr)
    }
    for (const c of cases || []) {
      const invs = invGrouped.get(c.customer_id) || []
      c.total_outstanding = invs.reduce(
        (s: number, i: any) => s + (Number(i.total) || 0) - (Number(i.paid_amount) || 0), 0,
      )
      const overdueInvs = invs.filter(
        (i: any) => i.status === 'overdue' || (i.due_date && new Date(i.due_date) < now),
      )
      c.total_overdue = overdueInvs.length > 0
        ? Math.max(...overdueInvs.map((i: any) =>
            Math.floor((now.getTime() - new Date(i.due_date).getTime()) / 86400000),
          ))
        : 0
    }

    // ── All collection actions for the customer set ──
    const { data: actions } = await supabaseAdmin
      .from('collection_actions')
      .select('id, customer_id, action_type, channel, template_name, status, trigger_type, scheduled_at, completed_at, invoice_ids')
      .eq('tenant_id', tenantId)
      .order('scheduled_at', { ascending: true })
      .limit(500)

    const actionIds = (actions || []).map((a: any) => a.id)

    // ── Completed-today events (for the completed section) ──
    const { data: completedEvents } = actionIds.length
      ? await supabaseAdmin
          .from('collection_action_events')
          .select('action_id, event_type, created_at, payload')
          .eq('tenant_id', tenantId)
          .eq('event_type', 'completed')
          .gte('created_at', startOfDay.toISOString())
          .in('action_id', actionIds)
          .order('created_at', { ascending: false })
          .limit(200)
      : { data: [] as any[] }

    const completedActionIds = new Set((completedEvents || []).map((e: any) => e.action_id))

    const customerIds = [...new Set((actions || []).map((a: any) => a.customer_id).filter(Boolean))]
    const { data: customers } = customerIds.length
      ? await supabaseAdmin.from('customers').select('id, customer_name, phone, customer_tier').in('id', customerIds)
      : { data: [] as any[] }
    const custMap = new Map((customers || []).map((c: any) => [c.id, c]))

    // WhatsApp delivery/read signals per action (for recommendation engine)
    const { data: wa } = actionIds.length
      ? await supabaseAdmin
          .from('whatsapp_events')
          .select('recovery_attempt_id, template, delivered_at, read_at, status')
          .eq('tenant_id', tenantId)
          .in('recovery_attempt_id', actionIds)
          .limit(400)
      : { data: [] as any[] }
    const waByAction = new Map<string, any[]>()
    for (const w of wa || []) {
      const arr = waByAction.get(w.recovery_attempt_id) || []
      arr.push(w)
      waByAction.set(w.recovery_attempt_id, arr)
    }

    const fmtMoney = (n: number) => Math.round(n)
    const days = (iso: any) => (iso ? Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000) : null)

    // Priority score for ordering within groups
    function priority(c: any, overdueDays: number) {
      let p = 0
      const pd = c?.promise_to_pay_date
      if (c?.brokenPromises > 0 || (pd && (days(pd as any) ?? 0) > 0)) p += 100
      if (c?.recovery_state_v2 === 'partial_payment') p += 40
      p += Math.min(overdueDays, 60)
      p += Math.min(fmtMoney(c?.total_outstanding || 0) / 1000, 50)
      return p
    }

    function reasonFor(c: any, overdueDays: number): string {
      if (c?.promise_to_pay_date) {
        const bd = days(c.promise_to_pay_date as any)
        if (bd !== null && bd > 0) return `Broken promise ${bd}d ago`
        if (bd === 0) return 'Promise due today'
      }
      if (c?.recovery_state_v2 === 'partial_payment') return 'Partial payment'
      if (overdueDays > 0) return `Invoice overdue ${overdueDays}d`
      return 'Outstanding balance'
    }

    const buildCard = (a: any, kind: any) => {
      const c = caseByCustomer.get(a.customer_id)
      const cust = custMap.get(a.customer_id) || {}
      const outstanding = fmtMoney(Number(c?.total_outstanding || 0))
      const overdueDays = c ? days(c.promise_to_pay_date as any) : null
      const broken = (c?.brokenPromises || 0) > 0 || (c?.promise_to_pay_date && (days(c.promise_to_pay_date as any) ?? 0) > 0)
      let reason: string
      if (c?.promise_to_pay_date) {
        const bd = days(c.promise_to_pay_date as any)
        reason = bd !== null && bd > 0 ? `Broken promise ${bd}d ago` : 'Promise due today'
      } else if (c?.recovery_state_v2 === 'partial_payment') {
        reason = 'Partial payment made'
      } else if (Number(c?.total_overdue || 0) > 0) {
        reason = `Invoice overdue ${c.total_overdue}d`
      } else {
        reason = 'Outstanding balance'
      }
      const waEvs = waByAction.get(a.id) || []
      const reminderWa = waEvs.filter((w: any) => w.template)
      const lastDelivered = reminderWa.filter((w: any) => w.delivered_at).sort((x: any, y: any) => +new Date(y.delivered_at) - +new Date(x.delivered_at))[0]
      const lastRead = reminderWa.filter((w: any) => w.read_at).sort((x: any, y: any) => +new Date(y.read_at) - +new Date(x.read_at))[0]
      const undelivered = reminderWa.filter((w: any) => !w.delivered_at && w.status === 'failed').length

      return {
        actionId: a.id,
        customerId: a.customer_id,
        customerName: cust.customer_name || 'Customer',
        phone: cust.phone || '',
        tier: cust.customer_tier || 'standard',
        outstanding,
        state: c?.recovery_state_v2 || null,
        brokenPromises: c?.brokenPromises || 0,
        actionType: a.action_type,
        channel: a.channel,
        templateName: a.template_name,
        scheduledAt: a.scheduled_at,
        completedAt: a.completed_at,
        reason,
        kind,
        _priority: priority(c, Number(c?.total_overdue || 0)),
      }
    }

    const needsCall: any[] = []
    const sendReminder: any[] = []
    const promiseFollowup: any[] = []
    const scheduledLater: any[] = []
    const completedToday: any[] = []

    for (const a of actions || []) {
      const c = caseByCustomer.get(a.customer_id)
      const overdueDays = c ? Number(c.total_overdue || 0) : 0
      const isCallCase =
        !!c && (c.broken_promises > 0 ||
          (c?.promise_to_pay_date && (days(c.promise_to_pay_date as any) ?? 0) > 0) ||
          c.next_action_type === 'call' ||
          overdueDays > 30)

      const scheduled = new Date(a.scheduled_at)
      const isFuture = scheduled > now
      const isToday = scheduled >= startOfDay && scheduled < endOfDay

      if (a.status === 'completed' || completedActionIds.has(a.id)) {
        completedToday.push(buildCard(a, 'completed'))
      } else if (isCallCase && a.action_type === 'call' && a.status === 'scheduled') {
        needsCall.push(buildCard(a, 'call'))
      } else if (a.status === 'scheduled' && a.action_type === 'promise_followup' && !isFuture) {
        promiseFollowup.push(buildCard(a, 'promise'))
      } else if (a.status === 'scheduled' && a.action_type === 'reminder' && !isFuture) {
        sendReminder.push(buildCard(a, 'reminder'))
      } else if (a.status === 'scheduled' && isFuture && isToday) {
        scheduledLater.push(buildCard(a, 'scheduled'))
      } else if (a.status === 'scheduled' && !isFuture && a.action_type !== 'call') {
        // overdue-but-not-yet-sent reminder/promise
        if (a.action_type === 'promise_followup') promiseFollowup.push(buildCard(a, 'promise'))
        else sendReminder.push(buildCard(a, 'reminder'))
      }
    }

    const sortByPriority = (arr: any[]) => arr.sort((x, y) => y._priority - x._priority)
    ;[needsCall, sendReminder, promiseFollowup, scheduledLater, completedToday].forEach(sortByPriority)

    // Strip internal _priority before sending
    const clean = (arr: any[]) => arr.map(({ _priority, ...rest }) => rest)

    const sectionMoney = (arr: any[]) => arr.reduce((s, x) => s + x.outstanding, 0)

    const result = {
      generatedAt: now.toISOString(),
      needsCall: { items: clean(needsCall), count: needsCall.length, total: sectionMoney(needsCall) },
      sendReminder: { items: clean(sendReminder), count: sendReminder.length, total: sectionMoney(sendReminder) },
      promiseFollowup: { items: clean(promiseFollowup), count: promiseFollowup.length, total: sectionMoney(promiseFollowup) },
      scheduledLater: { items: clean(scheduledLater), count: scheduledLater.length, total: sectionMoney(scheduledLater) },
      completedToday: { items: clean(completedToday), count: completedToday.length, total: sectionMoney(completedToday) },
    }

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[WorkQueue] failed', err)
    return NextResponse.json({ error: err?.message ?? 'unknown' }, { status: 500 })
  }
}
