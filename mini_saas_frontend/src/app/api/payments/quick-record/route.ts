import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { writeOutboxEvent } from '@/lib/billzo/outbox'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { PAYMENT_SOURCES } from '@billzo/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId!

    const body = await request.json()
    const { customerId, amount, source, notes } = body as {
      customerId?: string
      amount?: number
      source?: string
      notes?: string
    }

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 })
    }

    const normalizedSource = PAYMENT_SOURCES.includes(source as any) ? source : 'cash'

    // Resolve customer details and outstanding
    const { data: invoices } = await supabaseAdmin
      .from('invoices')
      .select('id, total, paid_amount, invoice_number, due_date')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .in('status', ['unpaid', 'overdue', 'partial'])
      .order('due_date', { ascending: true, nullsFirst: false })

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ error: 'No open invoices found for this customer' }, { status: 404 })
    }

    // Auto-allocate to oldest invoice first
    const oldestInvoice = invoices[0]
    const outstanding = Math.max(
      (parseFloat(oldestInvoice.total) || 0) - (parseFloat(oldestInvoice.paid_amount) || 0),
      0
    )

    if (outstanding <= 0) {
      return NextResponse.json({ error: 'Selected invoice has no outstanding amount' }, { status: 400 })
    }

    const paymentAmount = Math.min(amount, outstanding)
    const paymentId = crypto.randomUUID()
    const now = new Date().toISOString()

    const { error: insertError } = await supabaseAdmin.from('payments').insert({
      id: paymentId,
      tenant_id: tenantId,
      invoice_id: oldestInvoice.id,
      amount: paymentAmount,
      payment_mode: normalizedSource,
      source: normalizedSource,
      actor: 'merchant',
      evidence: {},
      notes: notes || null,
      status: 'paid',
      paid_at: now,
      created_at: now,
      updated_at: now,
    })

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    await writeOutboxEvent({
      type: 'payment.completed',
      tenantId,
      entityId: oldestInvoice.id,
      payload: {
        customerId,
        amount: paymentAmount,
        source: normalizedSource,
        actor: 'merchant',
        evidence: {},
        paymentId,
      },
      correlationId: `payment:${oldestInvoice.id}`,
    })

    const remaining = amount - paymentAmount

    return NextResponse.json({
      success: true,
      paymentId,
      invoiceId: oldestInvoice.id,
      amount: paymentAmount,
      source: normalizedSource,
      customerId,
      remaining: remaining > 0 ? remaining : 0,
      refresh: ['recovery_queue', 'dashboard', 'invoice', 'customer'],
    })
  } catch (err: any) {
    console.error('[QuickRecord] Error:', err)
    return NextResponse.json({ error: err.message || 'Failed to record payment' }, { status: 500 })
  }
}
