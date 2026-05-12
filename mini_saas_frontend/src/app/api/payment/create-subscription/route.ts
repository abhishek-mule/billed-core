export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'

const PRO_PRICE = 29900 // ₹299 in paise
const GROWTH_PRICE = 59900 // ₹599 in paise

const razorpay = process.env.RAZORPAY_KEY_ID
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    })
  : null

interface PaymentRequest {
  tenantId: string
  tenantName?: string
  plan: 'pro' | 'growth'
  customerEmail?: string
  customerPhone?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: PaymentRequest = await request.json()
    const { tenantId, tenantName, plan = 'pro', customerEmail, customerPhone } = body

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 })
    }

    if (!['pro', 'growth'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const amount = plan === 'growth' ? GROWTH_PRICE : PRO_PRICE

    if (!razorpay) {
      return NextResponse.json({
        mock: true,
        orderId: `order_demo_${Date.now()}`,
        amount,
        plan,
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        message: 'Razorpay not configured - demo mode',
      })
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