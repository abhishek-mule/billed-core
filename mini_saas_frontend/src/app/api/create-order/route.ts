import { NextResponse } from 'next/server'
import Razorpay from 'razorpay'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
})

export async function POST(request: Request) {
  try {
    const { plan, shopName, email, phone } = await request.json()

    if (!plan || !['free', 'starter', 'pro'].includes(plan)) {
      return NextResponse.json(
        { error: 'Invalid plan' },
        { status: 400 }
      )
    }

    if (plan === 'free') {
      return NextResponse.json({
        id: 'free',
        amount: 0,
        currency: 'INR',
        status: 'created'
      })
    }

    const amount = plan === 'starter' ? 49900 : 99900
    const receipt = `order_${Date.now()}_${shopName?.replace(/\s+/g, '_') || 'unknown'}`

    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt,
      notes: {
        plan,
        shopName,
        email,
        phone
      }
    })

    return NextResponse.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      status: order.status
    })
  } catch (error: any) {
    console.error('Razorpay order creation failed:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create order' },
      { status: 500 }
    )
  }
}
