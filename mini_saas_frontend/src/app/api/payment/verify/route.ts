export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

interface VerifyRequest {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
  invoiceId?: string
  amount?: number
  tenantId?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: VerifyRequest = await request.json()
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, invoiceId, amount, tenantId } = body

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

    if (invoiceId) {
      try {
        const { error: updateError } = await supabaseAdmin
          .from('invoices')
          .update({
            status: 'paid',
            paid_amount: amount || 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', invoiceId)

        if (updateError) {
          console.error('[VerifyPayment] Supabase update failed:', updateError)
        } else {
          const { writeOutboxEvent } = await import('@/lib/billzo/outbox')
          await writeOutboxEvent({
            type: 'payment.completed',
            entityId: invoiceId,
            tenantId: tenantId || '',
            correlationId: razorpay_order_id,
            payload: {
              amount: amount || 0,
              provider: 'razorpay',
              providerPaymentId: razorpay_payment_id,
              razorpay_order_id,
            },
          })
        }
      } catch (dbError) {
        console.error('[VerifyPayment] DB update failed:', dbError)
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
