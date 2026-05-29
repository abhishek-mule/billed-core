export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { type PlanType } from '@/lib/billzo/plan-limits'
import { processRazorpayPaymentWebhook } from '@/lib/billzo/reconciliation'
import { submitIntent } from '@/lib/authority/transport'

const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET

export async function POST(request: NextRequest) {
  try {
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

        const tenantId = payment.notes?.tenantId
          || payment.notes?.tenant_id
          || (await resolveTenantFromPayment(payment))

        if (!tenantId) {
          console.log('[Webhook] Could not resolve tenantId for payment:', payment.id)
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
        const tenantId = notes.tenantId
        const plan = (notes.plan || 'pro') as PlanType

        if (!tenantId) {
          console.error('[Webhook] No tenantId in order notes')
          break
        }

        const { data: existing } = await supabaseAdmin
          .from('tenants')
          .select('id')
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
          // authority:fallback tenant.create — bootstrap tenant creation on first subscription
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
              invoice_count: 0,
              reminder_count: 0,
              created_at: now,
              updated_at: now,
            })
        }

        console.log(`[Webhook] Order paid - tenant ${tenantId} upgraded to ${plan}`)
        break
      }

      case 'subscription.activated': {
        const sub = event.payload.subscription
        const tenantId = sub?.notes?.tenantId
        const plan = (sub?.notes?.plan || 'pro') as PlanType
        if (!tenantId) break

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

        console.log(`[Webhook] Subscription cancelled - tenant ${tenantId}`)
        break
      }

      case 'subscription.paused': {
        const sub = event.payload.subscription
        const tenantId = sub?.notes?.tenantId
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
            payload: { planStatus: 'paused' },
            nonce: crypto.randomUUID(),
          }, 'app')
          if (!result.accepted) {
            console.error('[Webhook] Authority rejected subscription pause:', result.error)
          }
        }
        break
      }

      case 'subscription.resumed': {
        const sub = event.payload.subscription
        const tenantId = sub?.notes?.tenantId
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

async function resolveTenantFromPayment(payment: any): Promise<string | null> {
  try {
    if (payment.payment_link_id) {
      const { data: invoice } = await supabaseAdmin
        .from('invoices')
        .select('tenant_id')
        .eq('payment_link_id', payment.payment_link_id)
        .single()

      if (invoice?.tenant_id) return invoice.tenant_id
    }

    if (payment.contact) {
      const { data: invoice } = await supabaseAdmin
        .from('invoices')
        .select('tenant_id')
        .eq('customer_phone', payment.contact)
        .in('status', ['unpaid', 'partial', 'overdue'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (invoice?.tenant_id) return invoice.tenant_id
    }
  } catch {
  }

  return null
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
