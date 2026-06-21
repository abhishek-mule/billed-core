export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { verifyRequest, validateJsonBody, validateRequired, errorResponse, logApiAccess } from '@/lib/billzo/api-middleware'

const razorpay = process.env.RAZORPAY_KEY_ID
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    })
  : null

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId!
    const userId = auth.userId!

    const bodyResult = await validateJsonBody(request)
    if (bodyResult.response) return bodyResult.response
    const body = bodyResult.data!

    const { invoiceId, amount, customerName, customerPhone } = body as {
      invoiceId: string
      amount: number
      customerName?: string
      customerPhone?: string
    }

    const required = validateRequired(body, ['invoiceId', 'amount'])
    if (!required.valid) return errorResponse('invoiceId and amount are required', 400)

    if (!amount || amount < 1 || typeof amount !== 'number') {
      return errorResponse('Amount must be at least ₹1', 400)
    }

    if (!razorpay) {
      return errorResponse('Payment gateway not configured', 503)
    }

    const amountInPaise = Math.round(amount * 100)
    if (amountInPaise < 100) {
      return errorResponse('Minimum amount is ₹1 (100 paise)', 400)
    }

    logApiAccess(request, tenantId!, userId!, `payment.create_order:${invoiceId}`)

    const receipt = `inv_${invoiceId.slice(-12)}_${Date.now()}`

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt,
      notes: {
        invoiceId,
        tenantId: tenantId || '',
        customerName: customerName || '',
        customerPhone: customerPhone || '',
        source: 'billzo_standard_checkout',
      },
    })

    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    })
  } catch (error: any) {
    console.error('[CreateOrder] Error:', error)
    return NextResponse.json(
      { error: error.error?.description || 'Failed to create order' },
      { status: 500 }
    )
  }
}
