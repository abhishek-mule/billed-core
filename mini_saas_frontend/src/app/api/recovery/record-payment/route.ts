export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { recordPayment } from '@/lib/billzo/record-payment'

export async function POST(request: NextRequest) {
  const tenantId = request.cookies.get('bz_tenant')?.value
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { invoiceId, amount, source, notes } = body as {
    invoiceId: string
    amount: number
    source: string
    notes?: string
  }

  if (!invoiceId || !amount || amount <= 0) {
    return NextResponse.json({ error: 'invoiceId and valid amount required' }, { status: 400 })
  }

  const validSources = ['cash', 'bank_transfer', 'cheque', 'upi', 'adjustment']
  if (!validSources.includes(source)) {
    return NextResponse.json({ error: `Invalid source. Must be one of: ${validSources.join(', ')}` }, { status: 400 })
  }

  try {
    const result = await recordPayment({
      tenantId,
      invoiceId,
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
