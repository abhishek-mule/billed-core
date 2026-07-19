export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyRequest, validateJsonBody } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { recordBillingEvent, publishSubscriptionChange } from '@/lib/billzo/billing-events'

/**
 * Verify a completed subscription payment (order- or subscription-mode) and
 * activate the subscription. Emits a subscription_change outbox event so the
 * worker mirrors state onto tenants + writes subscription_history.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId!
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const bodyResult = await validateJsonBody(request, {
      fields: {
        razorpay_payment_id: { required: true, type: 'string' },
        subscriptionId: { required: true, type: 'string' },
      },
    })
    if (bodyResult.response) return bodyResult.response
    const { razorpay_payment_id, razorpay_signature, razorpay_order_id, subscriptionId } =
      bodyResult.data as {
        razorpay_payment_id: string
        razorpay_signature?: string
        razorpay_order_id?: string
        subscriptionId: string
      }

    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keySecret) return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 500 })

    // Signature verification when order-mode (subscription-mode uses webhook).
    if (razorpay_order_id && razorpay_signature) {
      const expected = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex')
      if (expected !== razorpay_signature) {
        return NextResponse.json({ error: 'Signature mismatch', verified: false }, { status: 400 })
      }
    }

    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id, tenant_id, plan_code, status')
      .eq('id', subscriptionId)
      .eq('tenant_id', tenantId)
      .single()

    if (subErr || !sub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }

    await recordBillingEvent({
      tenantId,
      eventType: 'subscription.verified',
      providerEventId: razorpay_payment_id,
      rawPayload: bodyResult.data,
    })

    await publishSubscriptionChange({
      tenantId,
      subscriptionId: sub.id,
      fromState: sub.status,
      toState: 'active',
      toPlanCode: sub.plan_code,
      reason: 'payment.verified',
      actor: 'app:verify',
      correlationId: razorpay_payment_id,
      idempotencyKey: `verify:${subscriptionId}:${razorpay_payment_id}`,
    })

    // Payment attempt record for dunning/analytics.
    await supabaseAdmin.from('payment_attempts').insert({
      tenant_id: tenantId,
      subscription_id: sub.id,
      provider_payment_id: razorpay_payment_id,
      status: 'captured',
    })

    return NextResponse.json({ verified: true, subscriptionId: sub.id, status: 'active' })
  } catch (error: any) {
    console.error('[SubscriptionVerify] Error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
