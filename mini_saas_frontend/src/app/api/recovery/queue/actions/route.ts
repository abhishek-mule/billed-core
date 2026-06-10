import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { writeOutboxEvent } from '@/lib/billzo/outbox'
import { recordPayment } from '@/lib/billzo/record-payment'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''

const ACTIONS_WITH_OUTBOX_EVENT: Record<string, string> = {
  send_reminder: 'recovery.reminder.sent',
  call: 'customer.called',
  mark_promise: 'promise.made',
  payment_reported: 'merchant.payment_reported',
  snooze: 'merchant.snoozed',
  mark_disputed: 'merchant.mark_disputed',
  mark_resolved: 'merchant.mark_closed',
}

export async function POST(request: NextRequest) {
  const tenantId = request.cookies.get('bz_tenant')?.value
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { caseId, action, payload } = body as {
    caseId: string
    action: string
    payload?: Record<string, any>
  }

  if (!caseId || !action) {
    return NextResponse.json({ error: 'caseId and action are required' }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Look up the case for customer info
  const { data: recoveryCase, error: caseErr } = await supabase
    .from('recovery_cases')
    .select('*, customers!inner(name, phone)')
    .eq('id', caseId)
    .eq('tenant_id', tenantId)
    .single()

  if (caseErr || !recoveryCase) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }

  // Track TTFA (Time To First Action)
  const ttfa = body.ttfa

  try {
    // ── record_payment: creates real payment record + emits payment.completed ──
    if (action === 'record_payment') {
      const amount = payload?.amount
      const source = payload?.source || 'cash'

      if (!amount || amount <= 0) {
        return NextResponse.json({ error: 'Valid amount required for record_payment' }, { status: 400 })
      }

      const pmtResult = await recordPayment({
        tenantId,
        invoiceId: payload?.invoiceId || caseId,
        amount,
        source,
        actor: 'merchant',
        evidence: { notes: payload?.notes || 'Recorded from recovery queue' },
        notes: payload?.notes,
      })

      if ('error' in pmtResult) {
        return NextResponse.json({ error: pmtResult.error }, { status: 500 })
      }
    }

    // ── Standard outbox actions ──
    else if (ACTIONS_WITH_OUTBOX_EVENT[action]) {
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
        tenantId,
        entityId: caseId,
        payload: outboxPayload,
      })
    }

    else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    // Log TTFA if provided
    if (ttfa && typeof ttfa === 'number') {
      console.log(`[TTFA] tenant=${tenantId} case=${caseId} action=${action} ms=${ttfa}`)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error(`[QueueAction] ${action} failed:`, err)
    return NextResponse.json({ error: err.message || 'Action failed' }, { status: 500 })
  }
}
