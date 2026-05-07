import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
})

const PRO_PRICE = 39900 // ₹399 in paise
const PRO_PLAN_ID = process.env.RAZORPAY_PLAN_ID

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tenantId, tenantName } = body

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 })
    }

    // Create a subscription plan if no plan exists
    let planId = PRO_PLAN_ID

    if (!planId) {
      // Create plan on the fly (in production, create once and store)
      const plan = await razorpay.plans.create({
        period: 'monthly',
        interval: 1,
        item: {
          name: 'BillZo Pro',
          amount: PRO_PRICE,
          currency: 'INR',
        },
      })
      planId = plan.id
    }

    // Create subscription with required fields
    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 12, // 12 months (cancels anytime)
      notes: {
        tenantId,
        tenantName: tenantName || 'Business',
      },
    }) as any

    return NextResponse.json({
      subscriptionId: subscription.id,
      planId,
      amount: PRO_PRICE,
      currency: 'INR',
    })

  } catch (error: any) {
    console.error('Razorpay create subscription error:', error)
    
    // If no API keys configured, return mock for demo
    if (error.message?.includes('api')) {
      return NextResponse.json({
        mock: true,
        subscriptionId: `sub_demo_${Date.now()}`,
        amount: PRO_PRICE,
        currency: 'INR',
        message: 'Razorpay not configured - running in demo mode',
      })
    }

    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 })
  }
}