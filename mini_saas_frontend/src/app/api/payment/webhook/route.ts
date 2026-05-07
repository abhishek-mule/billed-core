import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/billzo/db'

const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || ''

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-razorpay-signature')

    if (!signature) {
      return NextResponse.json({ error: 'No signature' }, { status: 400 })
    }

    // Verify webhook signature
    let isValid = false
    if (webhookSecret) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex')
      isValid = signature === expectedSignature
    } else {
      // Skip verification in demo mode
      isValid = true
    }

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = JSON.parse(body)

    switch (event.event) {
      case 'subscription.activated':
        await handleSubscriptionActivated(event.payload)
        break
      case 'subscription.cancelled':
        await handleSubscriptionCancelled(event.payload)
        break
      case 'subscription.charged':
        await handleSubscriptionCharged(event.payload)
        break
      default:
        console.log('Unhandled event:', event.event)
    }

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function handleSubscriptionActivated(payload: any) {
  const subscription = payload.subscription
  const tenantId = subscription.notes?.tenantId

  if (!tenantId) {
    console.log('No tenantId in subscription notes')
    return
  }

  // Update tenant to Pro
  await db().tenants.update(tenantId, {
    plan: 'pro',
    paywallUnlocked: true,
    subscriptionId: subscription.id,
    subscriptionStatus: 'active',
    updatedAt: new Date().toISOString(),
  })

  console.log(`Tenant ${tenantId} upgraded to Pro`)
}

async function handleSubscriptionCancelled(payload: any) {
  const subscription = payload.subscription
  const tenantId = subscription.notes?.tenantId

  if (!tenantId) return

  // Downgrade to free
  await db().tenants.update(tenantId, {
    plan: 'starter',
    subscriptionStatus: 'cancelled',
    updatedAt: new Date().toISOString(),
  })

  console.log(`Tenant ${tenantId} subscription cancelled`)
}

async function handleSubscriptionCharged(payload: any) {
  const payment = payload.payment
  const subscription = payload.subscription
  const tenantId = subscription?.notes?.tenantId

  if (!tenantId) return

  // Log payment for analytics
  console.log(`Payment received from tenant ${tenantId}: ₹${payment.amount / 100}`)
}