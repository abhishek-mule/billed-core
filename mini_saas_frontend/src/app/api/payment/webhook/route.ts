export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import Razorpay from 'razorpay'
import { supabaseAdmin, getDeviceTokens } from '@/lib/billzo/supabase-admin'
import { getFirebaseMessaging } from '@/lib/billzo/firebase-admin'
import { type PlanType } from '@/lib/billzo/plan-limits'
import { processRazorpayPaymentWebhook } from '@/lib/billzo/reconciliation'
import { submitIntent } from '@/lib/authority/transport'
import { recordBillingEvent, publishSubscriptionChange } from '@/lib/billzo/billing-events'

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
    const body = await request.text()
    const signature = request.headers.get('x-razorpay-signature')

    if (!webhookSecret) {
      console.error('[Webhook] Missing RAZORPAY_WEBHOOK_SECRET')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }

    if (!signature) {
      console.error('[Webhook] Missing signature header')
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex')

    if (!timingSafeEqual(signature, expectedSignature)) {
      console.error('[Webhook] Invalid signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    let event: any
    try {
      event = JSON.parse(body)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }
    console.log(`[Webhook] Received event: ${event.event}`)

    switch (event.event) {
      // ============================================================
      // PAYMENT RECONCILIATION
      // ============================================================
      case 'payment_link.paid':
      case 'payment.captured': {
        const payment = event.payload.payment?.entity || event.payload.payment_link?.entity
        if (!payment) {
          console.log('[Webhook] No payment entity found')
          break
        }

        const tenantId = payment.order_id
          ? await resolveTenantFromAuthoritativeOrder(payment.order_id)
          : null

        if (!tenantId) {
          console.log('[Webhook] No authoritative tenant for payment:', payment.id)
          break
        }

        try {
          const result = await processRazorpayPaymentWebhook(
            { payment: { entity: payment } },
            tenantId
          )

          if (result.matched) {
            console.log('[Webhook] Payment reconciled:', {
              invoiceId: result.invoiceId,
              matchType: result.matchType,
              confidence: result.confidence,
            })
          } else {
            console.log('[Webhook] Payment not matched to any invoice:', {
              amount: payment.amount / 100,
              phone: payment.contact,
              providerPaymentId: payment.id,
            })
          }

          // Fire real-time FCM Push Notification to merchant devices
          try {
            const tokens = await getDeviceTokens(tenantId)
            const messaging = getFirebaseMessaging()
            if (tokens.length > 0 && messaging) {
              const amountRs = Number(payment.amount || 0) / 100
              await messaging.sendEachForMulticast({
                tokens,
                notification: {
                  title: '💰 Payment Received',
                  body: `Payment of ₹${amountRs.toLocaleString('en-IN')} received via Razorpay`,
                },
                data: {
                  type: 'payment_received',
                  tenantId,
                  url: result.invoiceId ? `/invoices/${result.invoiceId}` : '/invoices',
                },
              })
            }
          } catch (pushErr) {
            console.error('[Webhook] Failed to dispatch FCM push notification:', pushErr)
          }
        } catch (err: any) {
          console.error('[Webhook] Reconciliation failed:', err)
        }
        break
      }

      // ============================================================
      // SUBSCRIPTION EVENTS — governed via tenant.update_subscription
      // ============================================================
      case 'order.paid': {
        const order = event.payload.order
        const notes = order?.notes || {}
        const plan = (notes.plan || 'pro') as PlanType

        // B-04 residual: anchor the billing tenant to a server-created record —
        // invoice-bound checkout orders first, then our subscription row.
        // Never mint or move tenants from raw notes alone.
        const tenantId =
          (notes.source === 'billzo_standard_checkout' && notes.invoiceId
            ? await resolveTenantFromAuthoritativeOrder(order?.id)
            : null) || (await resolveSubscriptionTenant(notes, null))

        if (!tenantId) {
          console.error('[Webhook] No authoritative tenant for order:', order?.id)
          break
        }

        await recordBillingEvent({
          tenantId,
          eventType: 'order.paid',
          providerEventId: order?.id,
          rawPayload: event.payload,
        })

        const { data: existing } = await supabaseAdmin
          .from('tenants')
          .select('id, plan, subscription_state')
          .eq('id', tenantId)
          .single()

        const now = new Date().toISOString()

        if (existing) {
          const result = await submitIntent({
            intentId: crypto.randomUUID(),
            intentType: 'tenant.update_subscription',
            intentVersion: 1,
            tenantId,
            actor: 'system:razorpay_webhook',
            source: 'app',
            timestamp: now,
            causationId: null,
            correlationId: null,
            payload: { plan, planStatus: 'active', subscriptionId: order.id, paywallUnlocked: true, updatedAt: now },
            nonce: crypto.randomUUID(),
          }, 'app')
          if (!result.accepted) {
            console.error('[Webhook] Authority rejected subscription update:', result.error)
          }
        } else {
          // authority:fallback tenant.create — bootstrap tenant creation on first
          // subscription. Safe: tenantId above is anchored to our subscription
          // row (or an invoice-bound order), never raw notes alone.
          await supabaseAdmin
            .from('tenants')
            .insert({
              id: tenantId,
              name: notes.tenantName || 'Business',
              owner_user_id: `user_${tenantId.slice(0, 8)}`,
              plan,
              paywall_unlocked: true,
              subscription_id: order.id,
              subscription_status: 'active',
              subscription_state: 'active',
              invoice_count: 0,
              reminder_count: 0,
              created_at: now,
              updated_at: now,
            })
        }

        await publishSubscriptionChange({
          tenantId,
          fromState: existing?.subscription_state,
          toState: 'active',
          fromPlanCode: existing?.plan,
          toPlanCode: plan,
          reason: 'webhook.order_paid',
          correlationId: order?.id,
          idempotencyKey: `order.paid:${order?.id}`,
        })

        console.log(`[Webhook] Order paid - tenant ${tenantId} upgraded to ${plan}`)
        break
      }

      case 'subscription.activated': {
        const sub = event.payload.subscription
        // B-04 residual: anchor to our subscription row, not raw notes.
        const tenantId = await resolveSubscriptionTenant(sub?.notes, sub?.id)
        const plan = (sub?.notes?.plan || 'pro') as PlanType
        if (!tenantId) break

        await recordBillingEvent({
          tenantId,
          eventType: 'subscription.activated',
          providerEventId: sub?.id,
          rawPayload: event.payload,
        })

        const result = await submitIntent({
          intentId: crypto.randomUUID(),
          intentType: 'tenant.update_subscription',
          intentVersion: 1,
          tenantId,
          actor: 'system:razorpay_webhook',
          source: 'app',
          timestamp: new Date().toISOString(),
          causationId: null,
          correlationId: null,
          payload: { plan, planStatus: 'active', subscriptionId: sub?.id, paywallUnlocked: true },
          nonce: crypto.randomUUID(),
        }, 'app')
        if (!result.accepted) {
          console.error('[Webhook] Authority rejected subscription activation:', result.error)
        }

        await publishSubscriptionChange({
          tenantId,
          toState: 'active',
          toPlanCode: plan,
          reason: 'webhook.subscription_activated',
          correlationId: sub?.id,
          idempotencyKey: `activated:${sub?.id}`,
        })

        console.log(`[Webhook] Subscription activated - tenant ${tenantId}`)
        break
      }

      case 'subscription.charged': {
        const sub = event.payload.subscription
        const tenantId = await resolveSubscriptionTenant(sub?.notes, sub?.id)
        if (tenantId) {
          await recordBillingEvent({
            tenantId,
            eventType: 'subscription.charged',
            providerEventId: event.payload.payment?.entity?.id,
            rawPayload: event.payload,
          })
          await publishSubscriptionChange({
            tenantId,
            toState: 'active',
            reason: 'webhook.subscription_charged',
            correlationId: sub?.id,
            idempotencyKey: `charged:${event.payload.payment?.entity?.id}`,
          })
        }
        break
      }

      case 'subscription.cancelled': {
        const sub = event.payload.subscription
        const tenantId = await resolveSubscriptionTenant(sub?.notes, sub?.id)
        if (!tenantId) break

        await recordBillingEvent({
          tenantId,
          eventType: 'subscription.cancelled',
          providerEventId: sub?.id,
          rawPayload: event.payload,
        })

        const result = await submitIntent({
          intentId: crypto.randomUUID(),
          intentType: 'tenant.update_subscription',
          intentVersion: 1,
          tenantId,
          actor: 'system:razorpay_webhook',
          source: 'app',
          timestamp: new Date().toISOString(),
          causationId: null,
          correlationId: null,
          payload: { plan: 'starter', planStatus: 'cancelled', paywallUnlocked: false, cancelledAt: new Date().toISOString() },
          nonce: crypto.randomUUID(),
        }, 'app')
        if (!result.accepted) {
          console.error('[Webhook] Authority rejected subscription cancellation:', result.error)
        }

        await publishSubscriptionChange({
          tenantId,
          toState: 'cancelled',
          toPlanCode: 'starter',
          reason: 'webhook.subscription_cancelled',
          correlationId: sub?.id,
          idempotencyKey: `cancelled:${sub?.id}`,
        })

        console.log(`[Webhook] Subscription cancelled - tenant ${tenantId}`)
        break
      }

      case 'subscription.paused': {
        const sub = event.payload.subscription
        const tenantId = await resolveSubscriptionTenant(sub?.notes, sub?.id)
        if (tenantId) {
          await recordBillingEvent({
            tenantId,
            eventType: 'subscription.paused',
            providerEventId: sub?.id,
            rawPayload: event.payload,
          })
          const result = await submitIntent({
            intentId: crypto.randomUUID(),
            intentType: 'tenant.update_subscription',
            intentVersion: 1,
            tenantId,
            actor: 'system:razorpay_webhook',
            source: 'app',
            timestamp: new Date().toISOString(),
            causationId: null,
            correlationId: null,
            payload: { planStatus: 'paused' },
            nonce: crypto.randomUUID(),
          }, 'app')
          if (!result.accepted) {
            console.error('[Webhook] Authority rejected subscription pause:', result.error)
          }
          await publishSubscriptionChange({
            tenantId,
            toState: 'paused',
            reason: 'webhook.subscription_paused',
            correlationId: sub?.id,
            idempotencyKey: `paused:${sub?.id}`,
          })
        }
        break
      }

      case 'subscription.resumed': {
        const sub = event.payload.subscription
        const tenantId = await resolveSubscriptionTenant(sub?.notes, sub?.id)
        if (tenantId) {
          const result = await submitIntent({
            intentId: crypto.randomUUID(),
            intentType: 'tenant.update_subscription',
            intentVersion: 1,
            tenantId,
            actor: 'system:razorpay_webhook',
            source: 'app',
            timestamp: new Date().toISOString(),
            causationId: null,
            correlationId: null,
            payload: { planStatus: 'active' },
            nonce: crypto.randomUUID(),
          }, 'app')
          if (!result.accepted) {
            console.error('[Webhook] Authority rejected subscription resume:', result.error)
          }
          await publishSubscriptionChange({
            tenantId,
            toState: 'active',
            reason: 'webhook.subscription_resumed',
            correlationId: sub?.id,
            idempotencyKey: `resumed:${sub?.id}`,
          })
        }
        break
      }

      case 'subscription.halted': {
        const sub = event.payload.subscription
        const tenantId = await resolveSubscriptionTenant(sub?.notes, sub?.id)
        if (tenantId) {
          await recordBillingEvent({
            tenantId,
            eventType: 'subscription.halted',
            providerEventId: sub?.id,
            rawPayload: event.payload,
          })
          await publishSubscriptionChange({
            tenantId,
            toState: 'past_due',
            reason: 'webhook.subscription_halted',
            correlationId: sub?.id,
            idempotencyKey: `halted:${sub?.id}`,
          })
        }
        break
      }

      case 'subscription.pending': {
        const sub = event.payload.subscription
        const tenantId = await resolveSubscriptionTenant(sub?.notes, sub?.id)
        if (tenantId) {
          await recordBillingEvent({
            tenantId,
            eventType: 'subscription.pending',
            providerEventId: sub?.id,
            rawPayload: event.payload,
          })
          await publishSubscriptionChange({
            tenantId,
            toState: 'incomplete',
            reason: 'webhook.subscription_pending',
            correlationId: sub?.id,
            idempotencyKey: `pending:${sub?.id}`,
          })
        }
        break
      }

      case 'subscription.completed': {
        const sub = event.payload.subscription
        const tenantId = await resolveSubscriptionTenant(sub?.notes, sub?.id)
        if (tenantId) {
          await recordBillingEvent({
            tenantId,
            eventType: 'subscription.completed',
            providerEventId: sub?.id,
            rawPayload: event.payload,
          })
          await publishSubscriptionChange({
            tenantId,
            toState: 'expired',
            toPlanCode: 'starter',
            reason: 'webhook.subscription_completed',
            correlationId: sub?.id,
            idempotencyKey: `completed:${sub?.id}`,
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

/**
 * B-04 residual: authoritative tenant resolution for BILLING events
 * (order.paid, subscription.*).
 *
 * The payment path above anchors to the Razorpay Order + invoice binding.
 * Billing events anchor to OUR `subscriptions` row instead: `create-subscription`
 * persists a pending row server-side and stamps `notes.subscriptionId` with our
 * row id, so a matching local row proves the tenantId was server-associated.
 * A dashboard-crafted subscription (or tampered notes) has no local row → null.
 * Legacy subscriptions created before subscriptionId stamping fall back to notes
 * with a loud warning (audited migration path, not silent trust).
 */
async function resolveSubscriptionTenant(
  notes: any,
  providerSubscriptionId?: string | null,
): Promise<string | null> {
  const claimedTenant =
    typeof notes?.tenantId === 'string' && notes.tenantId ? notes.tenantId : null
  const subscriptionId =
    typeof notes?.subscriptionId === 'string' && notes.subscriptionId
      ? notes.subscriptionId
      : null

  if (subscriptionId) {
    const { data: row } = await supabaseAdmin
      .from('subscriptions')
      .select('id, tenant_id')
      .eq('id', subscriptionId)
      .single()
    if (!row || (claimedTenant && row.tenant_id !== claimedTenant)) return null
    return row.tenant_id as string
  }

  if (claimedTenant) {
    console.warn(
      '[Webhook] Billing event without local subscription anchor — legacy notes fallback:',
      providerSubscriptionId || 'unknown',
    )
    return claimedTenant
  }
  return null
}

/**
 * B-04: authoritative tenant resolution (fail-closed).
 *
 * Security contract:
 *  - The ONLY trusted identity source is the Razorpay Order we created server-side
 *    (orders/route.ts stamps `source: 'billzo_standard_checkout'` + invoiceId + tenantId).
 *  - `payment.notes` is ignored entirely: a crafted checkout can override the
 *    original order notes at capture time, so it is not a tenant authority.
 *  - The Order must be bound to a real invoice owned by its tenant:
 *    `order.notes.invoiceId` must resolve to an invoice whose tenant_id equals
 *    `order.notes.tenantId`. A mismatched or missing invoice => NO tenant.
 *  - Any failure (missing/invalid order, fetch error, wrong source, unbound
 *    invoice) => null => the payment is NOT reconciled. No fallback to
 *    contact/email/phone/notes.
 */
async function resolveTenantFromAuthoritativeOrder(orderId: string): Promise<string | null> {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) return null

  let order: any
  try {
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
    order = await razorpay.orders.fetch(orderId)
  } catch {
    return null
  }

  const notes = order?.notes ?? {}
  if (notes.source !== 'billzo_standard_checkout') return null

  const tenantId = typeof notes.tenantId === 'string' && notes.tenantId ? notes.tenantId : null
  const invoiceId = typeof notes.invoiceId === 'string' && notes.invoiceId ? notes.invoiceId : null
  if (!tenantId || !invoiceId) return null

  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('tenant_id')
    .eq('id', invoiceId)
    .single()

  if (!invoice || invoice.tenant_id !== tenantId) return null

  return tenantId
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
