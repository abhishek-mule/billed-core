import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { query } from '@/lib/db/client'

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || ''

function verifyWebhookSignature(body: string, signature: string): boolean {
  if (!WEBHOOK_SECRET || !signature) return false
  
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

async function updatePaymentStatus(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  status: 'captured' | 'failed',
  amount: number,
  tenantId?: string
) {
  try {
    // Find payment record by razorpay order ID or payment ID
    const existingPayment = await query<{ id: string; invoice_id: string; tenant_id: string }>(
      `SELECT id, invoice_id, tenant_id FROM payments 
       WHERE razorpay_payment_id = $1 OR payment_reference = $2
       LIMIT 1`,
      [razorpayPaymentId, razorpayOrderId]
    )

    if (existingPayment.length === 0) {
      console.warn(`[Payment] No payment record found for order: ${razorpayOrderId}`)
      return
    }

    const payment = existingPayment[0]
    const invoiceId = payment.invoice_id
    const actualTenantId = payment.tenant_id

    if (status === 'captured') {
      // Update payment record
      await query(
        `UPDATE payments 
         SET razorpay_payment_id = $1, is_reconciled = true, status = 'COMPLETED', updated_at = NOW()
         WHERE id = $2`,
        [razorpayPaymentId, payment.id]
      )

      // Update invoice payment status
      await query(
        `UPDATE invoices 
         SET payment_status = 'COMPLETED', erp_sync_status = 'PENDING'
         WHERE id = $1`,
        [invoiceId]
      )

      console.log(`[Payment] ✅ Captured: ${razorpayPaymentId} amount: ${amount}`)
    } else if (status === 'failed') {
      // Update payment record as failed
      await query(
        `UPDATE payments 
         SET is_reconciled = false, status = 'FAILED', updated_at = NOW()
         WHERE id = $1`,
        [payment.id]
      )

      // Keep invoice as pending
      console.error(`[Payment] ❌ Failed: ${razorpayPaymentId}`)
    }
  } catch (error) {
    console.error('[Payment Update] Database error:', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const signature = req.headers.get('x-razorpay-signature') || ''

    if (!verifyWebhookSignature(body, signature)) {
      console.error('[Webhook] Signature verification failed')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const eventData = JSON.parse(body)
    const event = eventData.event

    if (event === 'payment.captured') {
      const payment = eventData.payload.payment.entity
      
      await updatePaymentStatus(
        payment.order_id || '',
        payment.id,
        'captured',
        payment.amount
      )
      
    } else if (event === 'payment.failed') {
      const payment = eventData.payload.payment.entity
      
      await updatePaymentStatus(
        payment.order_id || '',
        payment.id,
        'failed',
        payment.amount
      )
    } else if (event === 'order.paid') {
      // Order completion webhook
      const order = eventData.payload.order.entity
      console.log(`[Order] Paid: ${order.id}`)
    }

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error('[Webhook] Error:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
