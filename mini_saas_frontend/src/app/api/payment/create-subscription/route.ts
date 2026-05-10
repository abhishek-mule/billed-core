import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'

const razorpay = process.env.RAZORPAY_KEY_ID
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
  : null

const PRO_PRICE = 29900 // ₹299 in paise
const PRO_PLAN_ID = process.env.RAZORPAY_PLAN_ID

const PLAN_CONFIGS = {
  starter: { price: 0, name: 'Starter', features: ['3 invoices', '5 reminders'] },
  pro: { price: PRO_PRICE, name: 'Pro', features: ['Unlimited invoices', 'Unlimited reminders', 'Auto recovery', 'Priority support'] },
  growth: { price: 59900, name: 'Growth', features: ['Everything in Pro', 'Multi-user', 'Analytics', 'Custom branding'] },
} as const

interface SubscriptionRequest {
  tenantId: string
  tenantName?: string
  plan: 'pro' | 'growth'
  customerEmail?: string
  customerPhone?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: SubscriptionRequest = await request.json()
    const { tenantId, tenantName, plan = 'pro', customerEmail, customerPhone } = body

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID is required' },
        { status: 400 }
      )
    }

    if (!['pro', 'growth'].includes(plan)) {
      return NextResponse.json(
        { error: 'Invalid plan. Must be "pro" or "growth"' },
        { status: 400 }
      )
    }

    const config = PLAN_CONFIGS[plan]

    if (!razorpay) {
      return NextResponse.json({
        mock: true,
        subscriptionId: `sub_demo_${Date.now()}`,
        planId: `plan_demo_${plan}`,
        amount: config.price,
        currency: 'INR',
        message: 'Razorpay not configured - demo mode',
      })
    }

    let planId = plan === 'pro' ? PRO_PLAN_ID : process.env.RAZORPAY_GROWTH_PLAN_ID

    if (!planId) {
      const createdPlan = await razorpay.plans.create({
        period: 'monthly',
        interval: 1,
        item: {
          name: `BillZo ${config.name}`,
          amount: config.price,
          currency: 'INR',
          description: config.features.join(', '),
        },
      })
      planId = createdPlan.id

      if (plan === 'pro') {
        process.env.RAZORPAY_PLAN_ID = planId
      } else {
        process.env.RAZORPAY_GROWTH_PLAN_ID = planId
      }
    }

    const customerPayload: Record<string, string> = {
      name: tenantName || 'BillZo Customer',
    }

    if (customerEmail) customerPayload.email = customerEmail
    if (customerPhone) customerPayload.contact = customerPhone

    const customer = await razorpay.customers.create(customerPayload as any)

    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 12,
      start_at: Math.floor(Date.now() / 1000) + 86400,
      notes: {
        tenantId,
        tenantName: tenantName || 'Business',
        plan,
      },
    }) as any

    return NextResponse.json({
      subscriptionId: subscription.id,
      customerId: customer.id,
      planId,
      amount: config.price,
      currency: 'INR',
      plan,
      keyId: process.env.RAZORPAY_KEY_ID,
    })
  } catch (error: any) {
    console.error('Razorpay subscription error:', error)

    if (error.statusCode === 400) {
      return NextResponse.json(
        { error: 'Invalid subscription request', details: error.error?.description },
        { status: 400 }
      )
    }

    if (error.statusCode === 401 || error.statusCode === 403) {
      return NextResponse.json(
        { error: 'Payment provider authentication failed' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to create subscription. Please try again.' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    plans: Object.entries(PLAN_CONFIGS).map(([id, config]) => ({
      id,
      name: config.name,
      price: config.price,
      currency: 'INR',
      features: config.features,
    })),
  })
}