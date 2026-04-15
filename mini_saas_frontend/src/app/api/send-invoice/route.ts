import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { customer, items, totals } = body

    if (!customer.phone) {
      return NextResponse.json({ success: false, error: 'Customer phone is required' }, { status: 400 })
    }

    // 1. Generate Razorpay Payment Link (Mock for Core demo)
    // In production, this would use razorpay.paymentLink.create(...)
    const paymentLink = `https://rzp.io/i/billed-${Math.random().toString(36).substr(2, 6)}`

    // 2. Trigger WhatsApp Notification via n8n/Gupshup
    // We target the n8n webhook defined in our monorepo or direct API
    const N8N_WH_URL = process.env.N8N_WH_SEND_INVOICE || 'https://n8n.billed.in/webhook/send-invoice'
    
    // For the Billed-Core demo, we simulate success
    console.log(`[Billed] Sending Invoice to ${customer.phone} with link ${paymentLink}`)

    /* 
    Optional: Actual fetch to n8n
    await fetch(N8N_WH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: customer.phone,
        customerName: customer.name,
        amount: totals.total,
        paymentLink: paymentLink,
        items: items.map(i => i.name).join(', ')
      })
    })
    */

    return NextResponse.json({ 
      success: true, 
      message: 'Invoice and payment link sent via WhatsApp',
      paymentLink 
    })

  } catch (error) {
    console.error('Invoice Delivery Error:', error)
    return NextResponse.json({ success: false, error: 'Failed to send invoice' }, { status: 500 })
  }
}
