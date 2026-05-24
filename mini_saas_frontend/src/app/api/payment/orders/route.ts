export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Razorpay from 'razorpay'

const razorpay = process.env.RAZORPAY_KEY_ID
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    })
  : null

interface CreateOrderRequest {
  invoiceId: string
  amount: number
  customerName?: string
  customerPhone?: string
  tenantId?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateOrderRequest = await request.json()
    const { invoiceId, amount, customerName, customerPhone, tenantId } = body

    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 })
    }

    if (!amount || amount < 1) {
      return NextResponse.json({ error: 'Amount must be at least ₹1' }, { status: 400 })
    }

    if (!razorpay) {
      return NextResponse.json({
        mock: true,
        order_id: `order_demo_${Date.now()}`,
        amount: Math.round(amount * 100),
        currency: 'INR',
        key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        message: 'Razorpay not configured - demo mode',
      })
    }

    const amountInPaise = Math.round(amount * 100)
    if (amountInPaise < 100) {
      return NextResponse.json({ error: 'Minimum amount is ₹1 (100 paise)' }, { status: 400 })
    }

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
