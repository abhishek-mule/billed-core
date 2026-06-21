export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { verifyRequest, validateJsonBody, validateRequired, errorResponse, logApiAccess } from '@/lib/billzo/api-middleware'

const PRO_PRICE = 29900 // ₹299 in paise
const GROWTH_PRICE = 59900 // ₹599 in paise

const VALID_PLANS = new Set(['pro', 'growth'])

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

    const { tenantName, plan = 'pro', customerEmail, customerPhone } = body as {
      tenantName?: string
      plan: 'pro' | 'growth'
      customerEmail?: string
      customerPhone?: string
    }

    if (!VALID_PLANS.has(plan)) {
      return errorResponse(`Invalid plan. Must be one of: ${Array.from(VALID_PLANS).join(', ')}`, 400)
    }

    logApiAccess(request, tenantId, userId, `payment.create_subscription:${plan}`)

    const amount = plan === 'growth' ? GROWTH_PRICE : PRO_PRICE

    if (!razorpay) {
      return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 503 })
    }

    const receipt = `billzo_${tenantId.slice(-8)}_${Date.now()}`

    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt,
      notes: {
        tenantId,
        tenantName: tenantName || 'Business',
        plan,
      },
    })

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      plan,
      keyId: process.env.RAZORPAY_KEY_ID,
    })
  } catch (error: any) {
    console.error('[CreateOrder] Error:', error)
    return NextResponse.json(
      { error: error.error?.description || 'Failed to create order' },
      { status: 500 }
    )
  }
}