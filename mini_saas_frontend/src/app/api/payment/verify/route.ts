export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { submitIntent } from '@/lib/authority/transport'
import { recordPayment } from '@/lib/billzo/record-payment'

interface VerifyRequest {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
  invoiceId?: string
  amount?: number
  tenantId?: string
  customerId?: string
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    const body: VerifyRequest = await request.json()
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, invoiceId, amount, tenantId: bodyTenantId } = body
    const tenantId = bodyTenantId || auth.tenantId

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: 'Missing required fields: order_id, payment_id, signature' },
        { status: 400 }
      )
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keySecret) {
      return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 500 })
    }

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex')

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json(
        { error: 'Signature mismatch — payment verification failed', verified: false },
        { status: 400 }
      )
    }

    if (invoiceId && tenantId) {
      const pmtAmount = amount || 0

      // Resolve customerId — prefer explicit, fall back to invoice lookup
      let resolvedCustomerId = body.customerId
      if (!resolvedCustomerId) {
        const { data: inv } = await supabaseAdmin
          .from('invoices')
          .select('customer_id')
          .eq('id', invoiceId)
          .single()
        resolvedCustomerId = inv?.customer_id
      }

      try {
        const intentResult = await submitIntent(
          {
            intentId: crypto.randomUUID(),
            intentType: 'invoice.mark_paid',
            intentVersion: 1,
            tenantId,
            actor: 'payment-verify',
            source: 'app',
            timestamp: new Date().toISOString(),
            causationId: null,
            correlationId: razorpay_order_id,
            payload: { invoiceId, status: 'paid', paidAmount: pmtAmount },
            nonce: crypto.randomUUID(),
          },
          'app',
        )

        if (!intentResult.accepted) {
          console.error('[VerifyPayment] Authority rejected mark_paid:', intentResult.error)
        }

        // Record payment in unified ledger — trigger auto-maintains outstanding_amount
        await recordPayment({
          tenantId,
          invoiceId,
          customerId: resolvedCustomerId || '',
          amount: pmtAmount,
          source: 'razorpay',
          actor: 'customer',
          evidence: {
            razorpayPaymentId: razorpay_payment_id,
            razorpayOrderId: razorpay_order_id,
          },
        })

        const { writeOutboxEvent } = await import('@/lib/billzo/outbox')
        await writeOutboxEvent({
          type: 'payment.completed',
          entityId: invoiceId,
          tenantId: tenantId || '',
          correlationId: razorpay_order_id,
          payload: {
            customerId: resolvedCustomerId || '',
            amount: pmtAmount,
            provider: 'razorpay',
            providerPaymentId: razorpay_payment_id,
            razorpay_order_id,
          },
        })
      } catch (dbError) {
        console.error('[VerifyPayment] Authority submission failed:', dbError)
      }
    }

    return NextResponse.json({
      verified: true,
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
    })
  } catch (error: any) {
    console.error('[VerifyPayment] Error:', error)
    return NextResponse.json(
      { error: 'Payment verification failed' },
      { status: 500 }
    )
  }
}
