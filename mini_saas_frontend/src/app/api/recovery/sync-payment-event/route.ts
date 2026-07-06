import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { verifyRequest, validateJsonBody, errorResponse } from '@/lib/billzo/api-middleware'
import { writeOutboxEvent } from '@/lib/billzo/outbox'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response

    const bodyResult = await validateJsonBody(request)
    if (bodyResult.response) return bodyResult.response

    const { paymentId, invoiceId, customerId, amount, source, sourceId, actor } = bodyResult.data!

    if (!paymentId || !invoiceId || !customerId || !amount) {
      return errorResponse('Missing paymentId, invoiceId, customerId, or amount', 400)
    }

    // Transition from created → synced
    await supabaseAdmin
      .from('payments')
      .update({ lifecycle_status: 'synced', updated_at: new Date().toISOString() })
      .eq('id', paymentId)
      .then(() => {}, () => {})

    await writeOutboxEvent({
      type: 'payment.completed',
      tenantId: auth.tenantId!,
      entityId: invoiceId,
      payload: {
        customerId,
        amount,
        source: source || 'cash',
        sourceId: sourceId || null,
        actor: actor || 'merchant',
        paymentId,
      },
      correlationId: `payment:${invoiceId}:sync:${paymentId}`,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[SyncPaymentEvent] Error:', err)
    return errorResponse('Internal server error', 500)
  }
}
