export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { recordPayment } from '@/lib/billzo/record-payment'
import { verifyRequest, validateJsonBody, validateRequired, errorResponse } from '@/lib/billzo/api-middleware'

const VALID_SOURCES = ['cash', 'bank_transfer', 'cheque', 'upi', 'adjustment']

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId!

    const bodyResult = await validateJsonBody(request)
    if (bodyResult.response) return bodyResult.response
    const body = bodyResult.data!

    const { invoiceId, customerId, amount, source, notes } = body as {
      invoiceId: string
      customerId?: string
      amount: number
      source: string
      notes?: string
    }

    const required = validateRequired(body, ['invoiceId', 'amount', 'source'])
    if (!required.valid) {
      return errorResponse(`Missing required fields: ${Object.keys(required.errors!).join(', ')}`, 400)
    }

    if (!amount || amount <= 0 || typeof amount !== 'number') {
      return errorResponse('amount must be a positive number', 400)
    }

    if (!VALID_SOURCES.includes(source)) {
      return errorResponse(`Invalid source. Must be one of: ${VALID_SOURCES.join(', ')}`, 400)
    }

    // Resolve customerId — prefer explicit, fall back to invoice lookup
    let resolvedCustomerId = customerId
    if (!resolvedCustomerId) {
      const { supabaseAdmin } = await import('@/lib/billzo/supabase-admin')
      const { data: inv } = await supabaseAdmin
        .from('invoices')
        .select('customer_id')
        .eq('id', invoiceId)
        .single()
      resolvedCustomerId = inv?.customer_id
    }

    const result = await recordPayment({
      tenantId,
      invoiceId,
      customerId: resolvedCustomerId || '',
      amount,
      source: source as any,
      actor: 'merchant',
      evidence: { notes: notes || 'Recorded by merchant from invoice page' },
      notes,
    })

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, paymentId: result.paymentId })
  } catch (err: any) {
    console.error('[RecordPayment] Error:', err)
    return NextResponse.json({ error: err.message || 'Failed to record payment' }, { status: 500 })
  }
}
