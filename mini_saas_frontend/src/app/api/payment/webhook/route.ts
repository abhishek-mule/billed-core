import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/billzo/db'
import { type PlanType } from '@/lib/billzo/plan-limits'

export const dynamic = 'force-dynamic'

const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET

interface WebhookEvent {
  event: string
  payload: {
    subscription?: {
      id: string
      notes?: {
        tenantId?: string
        tenantName?: string
        plan?: string
      }
    }
    payment?: {
      entity: {
        id: string
        amount: number
        status: string
      }
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-razorpay-signature')

    if (!signature && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Missing webhook signature' },
        { status: 400 }
      )
    }

    if (signature && webhookSecret) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex')

      const isValid = timingSafeEqual(signature, expectedSignature)

      if (!isValid) {
        return NextResponse.json(
          { error: 'Invalid webhook signature' },
          { status: 401 }
        )
      }
    }

    const event: WebhookEvent = JSON.parse(body)

    switch (event.event) {
      case 'subscription.activated':
        await handleSubscriptionActivated(event.payload)
        break

      case 'subscription.charged':
        await handleSubscriptionCharged(event.payload)
        break

      case 'subscription.cancelled':
        await handleSubscriptionCancelled(event.payload)
        break

      case 'subscription.paused':
        await handleSubscriptionPaused(event.payload)
        break

      case 'subscription.resumed':
        await handleSubscriptionResumed(event.payload)
        break

      default:
        console.log(`[Webhook] Unhandled event: ${event.event}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

async function handleSubscriptionActivated(payload: WebhookEvent['payload']) {
  const subscription = payload.subscription
  const tenantId = subscription?.notes?.tenantId
  const plan = (subscription?.notes?.plan || 'pro') as PlanType

  if (!tenantId) {
    console.error('[Webhook] No tenantId in subscription notes')
    return
  }

  const existingTenant = await db().tenants.get(tenantId)

  if (existingTenant?.plan === plan && existingTenant?.subscriptionId === subscription?.id) {
    console.log(`[Webhook] Tenant ${tenantId} already on ${plan} - idempotent skip`)
    return
  }

  const now = new Date().toISOString()
  const updateData: Record<string, unknown> = {
    plan,
    paywallUnlocked: true,
    subscriptionId: subscription?.id,
    subscriptionStatus: 'active',
    updatedAt: now,
  }

  if (existingTenant) {
    await db().tenants.update(tenantId, updateData)
  } else {
    await db().tenants.add({
      id: tenantId,
      name: subscription?.notes?.tenantName || 'Business',
      ownerUserId: `user_from_subscription_${tenantId}`,
      plan,
      paywallUnlocked: true,
      subscriptionId: subscription?.id,
      subscriptionStatus: 'active',
      invoiceCount: 0,
      reminderCount: 0,
      createdAt: now,
      updatedAt: now,
    } as any)
  }

  console.log(`[Webhook] Tenant ${tenantId} activated with plan: ${plan}`)
}

async function handleSubscriptionCharged(payload: WebhookEvent['payload']) {
  const subscription = payload.subscription
  const payment = payload.payment
  const tenantId = subscription?.notes?.tenantId

  if (!tenantId) return

  const amount = payment?.entity?.amount
    ? `₹${(payment.entity.amount / 100).toFixed(2)}`
    : 'N/A'

  console.log(`[Webhook] Payment received from tenant ${tenantId}: ${amount}`)
}

async function handleSubscriptionCancelled(payload: WebhookEvent['payload']) {
  const subscription = payload.subscription
  const tenantId = subscription?.notes?.tenantId

  if (!tenantId) return

  const existingTenant = await db().tenants.get(tenantId)

  if (existingTenant?.subscriptionStatus === 'cancelled') {
    console.log(`[Webhook] Tenant ${tenantId} already cancelled - idempotent skip`)
    return
  }

  await db().tenants.update(tenantId, {
    plan: 'starter' as PlanType,
    paywallUnlocked: false,
    subscriptionStatus: 'cancelled',
    cancelledAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  console.log(`[Webhook] Tenant ${tenantId} subscription cancelled`)
}

async function handleSubscriptionPaused(payload: WebhookEvent['payload']) {
  const subscription = payload.subscription
  const tenantId = subscription?.notes?.tenantId

  if (!tenantId) return

  await db().tenants.update(tenantId, {
    subscriptionStatus: 'paused',
    updatedAt: new Date().toISOString(),
  })

  console.log(`[Webhook] Tenant ${tenantId} subscription paused`)
}

async function handleSubscriptionResumed(payload: WebhookEvent['payload']) {
  const subscription = payload.subscription
  const tenantId = subscription?.notes?.tenantId

  if (!tenantId) return

  await db().tenants.update(tenantId, {
    subscriptionStatus: 'active',
    updatedAt: new Date().toISOString(),
  })

  console.log(`[Webhook] Tenant ${tenantId} subscription resumed`)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
