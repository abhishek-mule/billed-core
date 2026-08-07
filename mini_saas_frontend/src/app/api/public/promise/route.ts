import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyUpiToken } from '@/lib/billzo/crypto'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, dueDate, note, amount } = body as {
      token: string
      dueDate: string
      note?: string
      amount?: number
    }

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    if (!dueDate) {
      return NextResponse.json({ error: 'dueDate is required' }, { status: 400 })
    }

    const payload = verifyUpiToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired payment token' }, { status: 400 })
    }

    const { invoiceId, tenantId } = payload

    const { data: invoice, error: invError } = await supabaseAdmin
      .from('invoices')
      .select('customer_id, status, total, paid_amount')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (invError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Invoice is already paid' }, { status: 400 })
    }

    const promiseId = crypto.randomUUID()
    const promise = {
      id: promiseId,
      tenant_id: tenantId,
      customer_id: invoice.customer_id || '',
      invoice_ids: [invoiceId],
      amount: amount || (Number(invoice.total || 0) - Number(invoice.paid_amount || 0)),
      due_date: dueDate,
      status: 'active',
      note: note || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { error: insertError } = await supabaseAdmin
      .from('payment_promises')
      .insert(promise)

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Log the recovery activity
    const activityId = crypto.randomUUID()
    await supabaseAdmin
      .from('recovery_activities')
      .insert({
        id: activityId,
        tenant_id: tenantId,
        invoice_id: invoiceId,
        customer_id: invoice.customer_id || '',
        type: 'promise_received',
        actor: 'customer',
        metadata: { amount: promise.amount, dueDate, note, promiseId },
        created_at: new Date().toISOString(),
      })

    return NextResponse.json({ success: true, promiseId })
  } catch (err: any) {
    console.error('[PublicPromise] Error:', err.message)
    return NextResponse.json({ error: 'Failed to record promise' }, { status: 500 })
  }
}
