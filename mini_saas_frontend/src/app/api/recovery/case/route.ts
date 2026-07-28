import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyRequest, errorResponse, validateJsonBody } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/recovery/case?caseId=xxx
 * Load a recovery case workspace by case ID (not customer ID).
 * This is the primary recovery workspace endpoint — case-centric, not customer-centric.
 *
 * Handles walk-in customers (cases with no real customer profile) gracefully.
 */
export async function GET(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const caseId = request.nextUrl.searchParams.get('caseId')
  if (!caseId) return NextResponse.json({ error: 'caseId required' }, { status: 400 })

  try {
    // Load the recovery case first
    const { data: rc } = await supabaseAdmin
      .from('recovery_cases')
      .select('id, customer_id, total_outstanding, recovery_state_v2, promise_to_pay_date, broken_promises, last_payment_at, next_action_type, updated_at')
      .eq('tenant_id', tenantId)
      .eq('id', caseId)
      .maybeSingle()

    if (!rc) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

    const customerId = rc.customer_id

    // Customer (nullable — walk-in cases may not have a real customer profile)
    const { data: cust } = customerId
      ? await supabaseAdmin
          .from('customers')
          .select('id, customer_name, phone, email, customer_tier, gstin, billing_address')
          .eq('id', customerId)
          .maybeSingle()
      : { data: null as any }

    // Invoices linked via customer_id (or tenant-wide if no customer_id)
    let invoicesQuery = supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, total, grand_total, paid_amount, outstanding_amount, status, due_date, created_at, customer_name')
      .eq('tenant_id', tenantId)
      .gt('outstanding_amount', 0)
      .order('created_at', { ascending: false })
      .limit(50)

    if (customerId) {
      invoicesQuery = invoicesQuery.eq('customer_id', customerId)
    }

    const { data: invoices } = await invoicesQuery

    // Collection actions linked via customer_id
    let actionsQuery = supabaseAdmin
      .from('collection_actions')
      .select('id, action_type, channel, template_name, status, scheduled_at, completed_at, trigger_type, invoice_ids')
      .eq('tenant_id', tenantId)
      .order('scheduled_at', { ascending: true })
      .limit(100)

    if (customerId) {
      actionsQuery = actionsQuery.eq('customer_id', customerId)
    }

    const { data: actions } = await actionsQuery

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

    // WhatsApp delivery signals
    const { data: wa } = actionIds.length
      ? await supabaseAdmin
          .from('whatsapp_events')
          .select('recovery_attempt_id, template, delivered_at, read_at, clicked_at, occurred_at, status')
          .eq('tenant_id', tenantId)
          .in('recovery_attempt_id', actionIds)
          .order('occurred_at', { ascending: false })
          .limit(200)
      : { data: [] as any[] }

    // Promise history
    let promisesQuery = supabaseAdmin
      .from('payment_promises')
      .select('id, promise_date, promise_amount, status, created_at, note')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (customerId) {
      promisesQuery = promisesQuery.eq('customer_id', customerId)
    }

    const { data: promises } = await promisesQuery

    // Build action rows with event/delivery data
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

    // Communication timeline
    const comm: any[] = []
    for (const a of actionRows) {
      for (const e of a.events) comm.push({ at: e.at, kind: 'action', text: e.type, detail: e.detail, actionId: a.id })
      if (a.delivery.deliveredAt) comm.push({ at: a.delivery.deliveredAt, kind: 'wa', text: 'delivered', actionId: a.id })
      if (a.delivery.readAt) comm.push({ at: a.delivery.readAt, kind: 'wa', text: 'read', actionId: a.id })
    }
    comm.sort((x, y) => +new Date(y.at) - +new Date(x.at))

    // Derive amounts from invoices
    const now = new Date()
    const invoiceOutstanding = (i: any) =>
      Number(i.outstanding_amount) > 0
        ? Number(i.outstanding_amount)
        : Math.max(0, (Number(i.grand_total || i.total || 0)) - (Number(i.paid_amount) || 0))
    const openInvoices = (invoices || []).filter((i: any) => invoiceOutstanding(i) > 0)
    const outstanding = openInvoices.reduce((s: number, i: any) => s + invoiceOutstanding(i), 0)
    const overdueInvs = openInvoices.filter(
      (i: any) => i.due_date && new Date(i.due_date) < now,
    )
    const oldestOverdue = overdueInvs.length > 0
      ? Math.max(...overdueInvs.map((i: any) =>
          Math.floor((now.getTime() - new Date(i.due_date).getTime()) / 86400000),
        ))
      : 0
    const promiseDate = rc?.promise_to_pay_date ?? null

    const invoiceCustomerName = (invoices || [])[0]?.customer_name || null

    return NextResponse.json({
      caseId: rc.id,
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
      case: {
        id: rc.id,
        outstanding,
        overdue: oldestOverdue,
        state: rc.recovery_state_v2,
        promiseDate,
        brokenPromises: rc.broken_promises || 0,
        lastPaymentAt: rc.last_payment_at,
        nextAction: rc.next_action_type,
      },
      invoices: openInvoices.map((i: any) => ({
        id: i.id,
        number: i.invoice_number,
        total: invoiceOutstanding(i),
        status: i.status,
        dueDate: i.due_date,
        createdAt: i.created_at,
        overdueDays: i.due_date
          ? Math.max(0, Math.floor((now.getTime() - new Date(i.due_date).getTime()) / 86400000))
          : 0,
      })),
      invoiceCount: openInvoices.length,
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
    })
  } catch (err: any) {
    console.error('[RecoveryCaseWorkspace] failed', err)
    return NextResponse.json({ error: err?.message ?? 'unknown' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response

    const { tenantId } = auth

    const bodyResult = await validateJsonBody(request)
    if (bodyResult.response) return bodyResult.response

    const { invoiceId, customerId, amount, customerName, customerPhone } = bodyResult.data!

    if (!invoiceId || !customerId || !amount) {
      return errorResponse('Missing invoiceId, customerId, or amount', 400)
    }

    const now = new Date().toISOString()

    // Check if recovery case already exists for this customer
    const { data: existing } = await supabaseAdmin
      .from('recovery_cases')
      .select('id, invoice_count, open_invoice_count, total_outstanding')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .limit(1)
      .maybeSingle()

    if (existing) {
      const { error: updateError } = await supabaseAdmin
        .from('recovery_cases')
        .update({
          invoice_count: (existing.invoice_count || 0) + 1,
          open_invoice_count: (existing.open_invoice_count || 0) + 1,
          total_outstanding: (parseFloat(existing.total_outstanding) || 0) + amount,
          last_activity_at: now,
          updated_at: now,
        })
        .eq('id', existing.id)

      if (updateError) {
        console.error('[RecoveryCaseAPI] Update error:', updateError)
        return errorResponse('Failed to update recovery case', 500)
      }
    } else {
      const caseId = crypto.randomUUID()
      const { error: insertError } = await supabaseAdmin
        .from('recovery_cases')
        .insert({
          id: caseId,
          tenant_id: tenantId,
          customer_id: customerId,
          status: 'open',
          invoice_count: 1,
          open_invoice_count: 1,
          total_outstanding: amount,
          recovery_state_v2: 'active',
          engagement_state_v2: 'unseen',
          attention_score: Math.round(amount / 1000),
          version: 1,
          last_activity_at: now,
          created_at: now,
          updated_at: now,
        })

      if (insertError) {
        console.error('[RecoveryCaseAPI] Insert error:', insertError)
        return errorResponse('Failed to create recovery case', 500)
      }
    }

    // Fire-and-forget: trigger immediate reminder via worker
    const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:10000'
    fetch(`${workerUrl}/api/v1/recovery/trigger-reminder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId, tenantId }),
    }).catch((err: any) => console.warn('[RecoveryCaseAPI] Trigger reminder failed:', err.message))

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[RecoveryCaseAPI] POST error:', err)
    return errorResponse('Internal server error', 500)
  }
}
