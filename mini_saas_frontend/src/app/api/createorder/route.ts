import { NextResponse } from 'next/server'
import Razorpay from 'razorpay'

export const dynamic = 'force-dynamic'

const getRazorpay = () => {
  const key_id = process.env.RAZORPAY_KEY_ID
  const key_secret = process.env.RAZORPAY_KEY_SECRET

  if (!key_id || !key_secret) {
    console.error('[BillZo] Razorpay keys MISSING from environment.')
    throw new Error('Razorpay not configured')
  }

  return new Razorpay({
    key_id,
    key_secret,
  })
}

export async function POST(request: Request) {
  console.log('[BillZo] Creating order...')
  
  let razorpay
  try {
    razorpay = getRazorpay()
  } catch (error: any) {
    console.error('[BillZo] Razorpay not configured:', error.message)
    return NextResponse.json(
      { error: 'Payment not configured', details: error.message },
      { status: 503 }
    )
  }
  
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
    
    const idempotencyKey = `${shopName}_${plan}_${Date.now()}`.slice(0, 40)

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
    }, {
      idempotency: idempotencyKey
    })

    console.log('[BillZo] Order created:', order.id)
    return NextResponse.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      status: order.status
    })
  } catch (error: any) {
    console.error('[BillZo] Razorpay order creation failed:', error.message || error)
    return NextResponse.json(
      { error: error.message || 'Failed to create order', details: error.message },
      { status: 500 }
    )
  }
}
