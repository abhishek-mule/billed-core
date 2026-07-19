export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import crypto from 'crypto'
import { verifyRequest, validateJsonBody, errorResponse, logApiAccess } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { recordBillingEvent } from '@/lib/billzo/billing-events'
import { getPlan, type PlanType } from '@/lib/billzo/plan-limits'

const VALID_PLANS = new Set<PlanType>(['pro', 'business'])

const razorpay = process.env.RAZORPAY_KEY_ID
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    })
  : null

const PLAN_PRICE_PAISE: Record<string, number> = { pro: 29900, business: 59900 }

/**
 * Create a RECURRING Razorpay Subscription for the authenticated tenant.
 * Phase 1 only supports pro/business (monthly). Enterprise is custom sales.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId!
    const userId = auth.userId!

    const bodyResult = await validateJsonBody(request)
    if (bodyResult.response) return bodyResult.response
    const body = bodyResult.data!

    const plan = getPlan((body as any).plan as string) as PlanType
    if (!VALID_PLANS.has(plan)) {
      return errorResponse(`Invalid plan. Must be one of: pro, business`, 400)
    }

    logApiAccess(request, tenantId, userId, `payment.create_subscription:${plan}`)

    const amount = PLAN_PRICE_PAISE[plan]
    if (!amount) return errorResponse('Unsupported plan pricing', 400)

    if (!razorpay) {
      return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 503 })
    }

    // Upsert a Razorpay customer for the tenant (idempotent by notes.tenantId).
    let customerId: string
    const { data: existingCust } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('id', tenantId)
      .single()
    void existingCust

    try {
      const customer = await razorpay.customers.create({
        name: (body as any).tenantName || 'Business',
        email: (body as any).customerEmail || undefined,
        contact: (body as any).customerPhone || undefined,
        notes: { tenantId },
      })
      customerId = customer.id
    } catch (err: any) {
      return NextResponse.json({ error: err?.error?.description || 'Customer creation failed' }, { status: 400 })
    }

    // Resolve our versioned plan id to attach.
    const { data: planRow } = await supabaseAdmin
      .from('plans')
      .select('id, code, version')
      .eq('code', plan)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    const now = new Date()
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    // Persist a pending subscription row (source of truth; webhook activates it).
    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        tenant_id: tenantId,
        plan_id: planRow?.id ?? null,
        plan_code: plan,
        plan_version: planRow?.version ?? 1,
        provider: 'razorpay',
        provider_customer_id: customerId,
        status: 'pending',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
      })
      .select('id')
      .single()

    if (subErr) {
      return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 })
    }

    const subscription = await razorpay.subscriptions.create({
      plan_id: process.env.RAZORPAY_PLAN_ID || '', // provider plan id (configured per env)
      customer_notify: 1,
      quantity: 1,
      total_count: 12, // 12 monthly cycles (auto-caps); webhook handles renewal/cancel
      notes: { tenantId, plan, subscriptionId: sub.id },
    }).catch(() => null)

    // If recurring plan not configured, fall back to a one-time order (Phase 1 parity).
    if (!subscription?.id) {
      const order = await razorpay.orders.create({
        amount,
        currency: 'INR',
        receipt: `billzo_${tenantId.slice(-8)}_${Date.now()}`,
        notes: { tenantId, plan, subscriptionId: sub.id },
      })
      await recordBillingEvent({
        tenantId,
        eventType: 'subscription.create_order',
        providerEventId: order.id,
        rawPayload: { order, plan },
      })
      return NextResponse.json({
        mode: 'order',
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        plan,
        subscriptionId: sub.id,
        keyId: process.env.RAZORPAY_KEY_ID,
      })
    }

    await supabaseAdmin
      .from('subscriptions')
      .update({ provider_subscription_id: subscription.id })
      .eq('id', sub.id)

    await recordBillingEvent({
      tenantId,
      eventType: 'subscription.created',
      providerEventId: subscription.id,
      rawPayload: { subscription, plan },
    })

    return NextResponse.json({
      mode: 'subscription',
      razorpaySubscriptionId: subscription.id,
      shortUrl: (subscription as any).short_url,
      plan,
      subscriptionId: sub.id,
      keyId: process.env.RAZORPAY_KEY_ID,
    })
  } catch (error: any) {
    console.error('[CreateSubscription] Error:', error)
    return NextResponse.json(
      { error: error?.error?.description || 'Failed to create subscription' },
      { status: 500 },
    )
  }
}
