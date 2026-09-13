export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import {
  verifyRequest,
  validateJsonBody,
  errorResponse,
} from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { recordRecoveryCreditPurchase } from '@/lib/billzo/recovery-credits'

interface VerifyRequest {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

/**
 * Verify a Razorpay credit-purchase callback (HMAC-SHA256 over
 * `order_id|payment_id`), then mark the order paid and record the ledger
 * purchase exactly once. No client-supplied amount is trusted anywhere: the
 * chargeable amount lives on the server-authoritative order row.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId

    const bodyResult = await validateJsonBody<VerifyRequest>(request, {
      fields: {
        razorpay_order_id: { required: true, type: 'string' },
        razorpay_payment_id: { required: true, type: 'string' },
        razorpay_signature: { required: true, type: 'string' },
      },
    })
    if (bodyResult.response) return bodyResult.response
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = bodyResult.data!

    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keySecret) {
      return errorResponse('Payment gateway not configured', 500)
    }

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex')

    if (expectedSignature !== razorpay_signature) {
      return errorResponse('Signature mismatch — payment verification failed', 400)
    }

    // Order must exist AND belong to the authenticated tenant. Its amount is
    // the authoritative charge — it is never recomputed from the client.
    const { data: order } = await supabaseAdmin
      .from('recovery_credit_orders')
      .select('id, tenant_id, razorpay_order_id, razorpay_payment_id, packet_code, credits, amount_paise, currency, status')
      .eq('razorpay_order_id', razorpay_order_id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!order) {
      return errorResponse('Unknown or foreign order', 400)
    }

    // Idempotent path: a payment already recorded credits for this order.
    const alreadyPaid = order.status === 'paid'

    if (!alreadyPaid) {
      const { error: updateError } = await supabaseAdmin
        .from('recovery_credit_orders')
        .update({
          status: 'paid',
          razorpay_payment_id,
          paid_at: new Date().toISOString(),
        })
        .eq('id', order.id)
        .eq('status', 'created')

      if (updateError) {
        console.error('[RecoveryCredits:verify] order update failed', updateError)
        return errorResponse('Failed to record payment', 500)
      }

      const recorded = await recordRecoveryCreditPurchase(tenantId!, {
        id: order.id,
        razorpay_order_id: order.razorpay_order_id,
        razorpay_payment_id: razorpay_payment_id || order.razorpay_payment_id,
        packet_code: order.packet_code,
        credits: order.credits,
        amount_paise: order.amount_paise,
        currency: order.currency,
        status: 'paid',
      })

      if (!recorded.ok) {
        return errorResponse(recorded.reason, 500)
      }
    }

    return NextResponse.json({
      verified: true,
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
    })
  } catch (error: any) {
    console.error('[RecoveryCredits:verify] Error:', error)
    return NextResponse.json(
      { error: 'Payment verification failed' },
      { status: 500 },
    )
  }
}