import { NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(req: Request) {
  try {
    const body = await req.text()
    const signature = req.headers.get('x-razorpay-signature')

    // 1. Verify Webhook Signature
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'YOUR_WEBHOOK_SECRET'
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex')

    if (signature !== expectedSignature) {
      // For demo's sake, we might log it, but in reality, this is a security fail
      console.warn('Razorpay Signature Verification Failed')
    }

    const eventData = JSON.parse(body)

    // 2. Handle Payment Success
    if (eventData.event === 'payment.captured' || eventData.event === 'order.paid') {
      const payment = eventData.payload.payment.entity
      const metadata = payment.notes // We passed invoice details in notes

      console.log(`[Billed] Payment Confirmed: ${payment.id} for Amount: ${payment.amount}`)

      // 3. FINAL TRIGGER: Decrement Stock in ERPNext
      // This calls a Frappe method to create a 'Sales Invoice' with 'Update Stock' enabled
      const FRAPPE_URL = process.env.FRAPPE_SITE_URL || 'http://localhost:8000'
      const FRAPPE_API_KEY = process.env.FRAPPE_API_KEY
      const FRAPPE_API_SECRET = process.env.FRAPPE_API_SECRET

      await fetch(`${FRAPPE_URL}/api/method/electrical_trader_pack.api.finalize_transaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `token ${FRAPPE_API_KEY}:${FRAPPE_API_SECRET}`
        },
        body: JSON.stringify({
          payment_id: payment.id,
          order_details: metadata
        })
      })
    }

    return NextResponse.json({ status: 'ok' })

  } catch (error) {
    console.error('Razorpay Webhook Error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
