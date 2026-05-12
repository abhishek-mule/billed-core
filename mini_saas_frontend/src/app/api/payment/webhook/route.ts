export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/billzo/db'
import { type PlanType } from '@/lib/billzo/plan-limits'

const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-razorpay-signature')

    if (signature && webhookSecret) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex')

      if (!timingSafeEqual(signature, expectedSignature)) {
        console.error('[Webhook] Invalid signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const event = JSON.parse(body)
    console.log(`[Webhook] Received event: ${event.event}`)

    switch (event.event) {
      case 'order.paid': {
        const order = event.payload.order
        const notes = order?.notes || {}
        const tenantId = notes.tenantId
        const plan = (notes.plan || 'pro') as PlanType

        if (!tenantId) {
          console.error('[Webhook] No tenantId in order notes')
          break
        }

        const existing = await db().tenants.get(tenantId)
        const now = new Date().toISOString()

        if (existing) {
          await db().tenants.update(tenantId, {
            plan,
            paywallUnlocked: true,
            subscriptionId: order.id,
            subscriptionStatus: 'active',
            updatedAt: now,
          })
        } else {
          await db().tenants.add({
            id: tenantId,
            name: notes.tenantName || 'Business',
            ownerUserId: `user_${tenantId.slice(0, 8)}`,
            plan,
            paywallUnlocked: true,
            subscriptionId: order.id,
            subscriptionStatus: 'active',
            invoiceCount: 0,
            reminderCount: 0,
            createdAt: now,
            updatedAt: now,
          } as any)
        }

        console.log(`[Webhook] Order paid - tenant ${tenantId} upgraded to ${plan}`)
        break
      }

      case 'subscription.activated': {
        const sub = event.payload.subscription
        const tenantId = sub?.notes?.tenantId
        const plan = (sub?.notes?.plan || 'pro') as PlanType

        if (!tenantId) break

        await db().tenants.update(tenantId, {
          plan,
          paywallUnlocked: true,
          subscriptionId: sub?.id,
          subscriptionStatus: 'active',
          updatedAt: new Date().toISOString(),
        })

        console.log(`[Webhook] Subscription activated - tenant ${tenantId}`)
        break
      }

      case 'subscription.charged':
        console.log(`[Webhook] Subscription charged`)
        break

      case 'subscription.cancelled': {
        const sub = event.payload.subscription
        const tenantId = sub?.notes?.tenantId

        if (!tenantId) break

        await db().tenants.update(tenantId, {
          plan: 'starter' as PlanType,
          paywallUnlocked: false,
          subscriptionStatus: 'cancelled',
          cancelledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })

        console.log(`[Webhook] Subscription cancelled - tenant ${tenantId}`)
        break
      }

      case 'subscription.paused': {
        const sub = event.payload.subscription
        const tenantId = sub?.notes?.tenantId

        if (tenantId) {
          await db().tenants.update(tenantId, {
            subscriptionStatus: 'paused',
            updatedAt: new Date().toISOString(),
          })
        }
        break
      }

      case 'subscription.resumed': {
        const sub = event.payload.subscription
        const tenantId = sub?.notes?.tenantId

        if (tenantId) {
          await db().tenants.update(tenantId, {
            subscriptionStatus: 'active',
            updatedAt: new Date().toISOString(),
          })
        }
        break
      }

      default:
        console.log(`[Webhook] Unhandled event: ${event.event}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Webhook] Processing error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}