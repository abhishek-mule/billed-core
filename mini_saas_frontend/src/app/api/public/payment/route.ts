import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { recordPayment } from '@/lib/billzo/record-payment'
import { verifyUpiToken } from '@/lib/billzo/crypto'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, amount, source, notes } = body as {
      token: string
      amount?: number
      source?: string
      notes?: string
    }

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const payload = verifyUpiToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired payment token' }, { status: 400 })
    }

    const { invoiceId, tenantId } = payload

    const { data: invoice, error: invError } = await supabaseAdmin
      .from('invoices')
      .select('customer_id, total, paid_amount, status')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (invError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    if (invoice.status === 'paid') {
      return NextResponse.json({ success: true, message: 'Invoice already fully paid' })
    }

    const paymentAmount = amount || (Number(invoice.total || 0) - Number(invoice.paid_amount || 0))

    const result = await recordPayment({
      tenantId,
      invoiceId,
      customerId: invoice.customer_id || '',
      amount: paymentAmount,
      source: (source as any) || 'upi',
      actor: 'customer',
      evidence: { notes: notes || 'Self-reported by customer via payment portal' },
      notes: notes || undefined,
    })

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 })
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
        type: 'customer_payment_reported',
        actor: 'customer',
        metadata: { amount: paymentAmount, source, notes, paymentId: result.paymentId },
        created_at: new Date().toISOString(),
      })

    return NextResponse.json({ success: true, paymentId: result.paymentId })
  } catch (err: any) {
    console.error('[PublicPayment] Error:', err.message)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }
}
