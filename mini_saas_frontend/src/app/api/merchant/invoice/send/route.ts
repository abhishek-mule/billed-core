import { NextResponse } from 'next/server'

interface LineItem {
  id: string
  item_code: string
  item_name: string
  qty: number
  rate: number
  amount: number
}

interface Customer {
  name: string
  customer_name: string
  phone: string
  gstin?: string
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { customer, items, totals } = body as { 
      customer: Customer
      items: LineItem[]
      totals: { subtotal: number; gst: number; total: number }
    }

    if (!customer?.phone) {
      return NextResponse.json({ 
        success: false, 
        error: 'Customer phone is required' 
      }, { status: 400 })
    }

    if (!items?.length) {
      return NextResponse.json({ 
        success: false, 
        error: 'At least one item required' 
      }, { status: 400 })
    }

    const invoiceId = `INV-${Date.now()}`
    const paymentLink = `https://rzp.io/i/billed-${invoiceId}`

    console.log(`[Merchant API] Creating invoice ${invoiceId} for ${customer.customer_name} (${customer.phone})`)
    console.log(`[Merchant API] Items:`, items.length)
    console.log(`[Merchant API] Total: ₹${totals.total}`)

    return NextResponse.json({ 
      success: true, 
      invoiceId,
      paymentLink,
      message: 'Invoice created and WhatsApp link sent'
    })

  } catch (error) {
    console.error('[Merchant API] Error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to create invoice' 
    }, { status: 500 })
  }
}