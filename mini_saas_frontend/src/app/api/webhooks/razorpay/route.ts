import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

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
      
      console.log(`[Payment] Captured: ${payment.id} amount: ${payment.amount}`)
      
    } else if (event === 'payment.failed') {
      const payment = eventData.payload.payment.entity
      console.error(`[Payment] Failed: ${payment.id} error: ${payment.error_description}`)
    }

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error('[Webhook] Error:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
