export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { validateJsonBody, errorResponse } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { recordRecoveryCreditRefund, type RecoveryCreditOrder } from '@/lib/billzo/recovery-credits'

const razorpay =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      })
    : null

/**
 * Back-office refund of a recovery-credit top-up order. Ops channel only,
 * protected by the same shared secret as POST /api/billing/worker — it is NOT
 * a tenant-facing route.
 *
 * Order of operations (never inverts):
 *   1. Provider clawback succeeds (razorpay.refunds.create).
 *   2. The order row is marked 'refunded' — this is the truth about the money.
 *   3. A 'refund' ledger entry is recorded (idempotent via UNIQUE order_id).
 *
 * If the purchased credits were already spent, step 3 refuses with
 * 'credits_consumed' — the money still goes back (order is refunded at the
 * provider), but the ledger cannot claw back credits that are gone. That is
 * the documented ops-escalation case; the ledger CHECK (balance >= 0) would
 * reject the negative pool anyway.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-billing-worker-key')
  const expected = process.env.BILLING_WORKER_KEY
  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const bodyResult = await validateJsonBody<{ razorpayOrderId: string; reason?: string }>(request, {
      fields: {
        razorpayOrderId: { required: true, type: 'string' },
        reason: { type: 'string' },
      },
    })
    if (bodyResult.response) return bodyResult.response

    const razorpayOrderId = bodyResult.data!.razorpayOrderId

    const { data: order } = await supabaseAdmin
      .from('recovery_credit_orders')
      .select('*')
      .eq('razorpay_order_id', razorpayOrderId)
      .maybeSingle()

    if (!order) {
      return errorResponse('Order not found', 404)
    }

    // Idempotency: an already-refunded order short-circuits before the provider.
    if (order.status === 'refunded') {
      const { data: existing } = await supabaseAdmin
        .from('recovery_credit_ledger')
        .select('id')
        .eq('order_id', razorpayOrderId)
        .eq('entry_type', 'refund')
        .maybeSingle()
      return NextResponse.json({
        ok: true,
        alreadyRefunded: true,
        creditsRefunded: Boolean(existing),
      })
    }

    // Only a PAID order carries chargeable credits. created/failed were never
    // charged; there is nothing to claw back (marking failed refunded would lie).
    if (order.status !== 'paid' || !order.razorpay_payment_id) {
      return errorResponse(`Order is not paid (status=${order.status}) — nothing to refund`, 409)
    }

    if (!razorpay) {
      return errorResponse('Payment gateway not configured', 503)
    }

    // 1. Provider clawback (full amount; the charge was server-computed).
    await razorpay.payments.refund(order.razorpay_payment_id, {
      amount: order.amount_paise,
      notes: {
        reason: 'billzo_recovery_credits_refund',
        orderId: razorpayOrderId,
      },
    })

    const refundedAt = new Date().toISOString()

    // 2. The order is refunded — this is the truth about the money.
    await supabaseAdmin
      .from('recovery_credit_orders')
      .update({
        status: 'refunded',
        metadata: { ...((order.metadata as Record<string, unknown>) || {}), refunded_at: refundedAt },
        updated_at: refundedAt,
      })
      .eq('id', order.id)
      .eq('status', 'paid')

    // 3. Ledger clawback. credits_consumed is a real outcome, reported not faked.
    const result = await recordRecoveryCreditRefund(
      order.tenant_id,
      order as RecoveryCreditOrder,
      'merchant_refund',
    )

    if (result.ok) {
      return NextResponse.json({
        ok: true,
        refunded: true,
        creditsRefunded: !('alreadyRefunded' in result && result.alreadyRefunded),
      })
    }

    return NextResponse.json(
      { ok: false, error: result.reason, refunded: true },
      { status: 409 },
    )
  } catch (error: any) {
    console.error('[RecoveryCredits:refund] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.error?.description || error?.message || 'Failed to refund order' },
      { status: 500 },
    )
  }
}