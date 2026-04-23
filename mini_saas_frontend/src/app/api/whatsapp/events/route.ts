import { NextResponse } from 'next/server'

type EventType = 'invoice.created' | 'invoice.sent' | 'payment.reminder' | 'credit.overdue' | 'daily.summary' | 'low.stock'

interface WhatsAppEvent {
  tenant_id: string
  event_type: EventType
  phone: string
  data: Record<string, any>
  scheduled_at?: string
}

const EVENT_WORKFLOWS: Record<EventType, string> = {
  'invoice.created': '/webhook/invoice-created',
  'invoice.sent': '/webhook/invoice-sent',
  'payment.reminder': '/webhook/payment-reminder',
  'credit.overdue': '/webhook/credit-overdue',
  'daily.summary': '/webhook/daily-summary',
  'low.stock': '/webhook/low-stock',
}

const N8N_WEBHOOK = process.env.N8N_WEBHOOK_URL?.replace('/setup-shop', '') || 'http://localhost:5678/webhook'

async function triggerWorkflow(event: WhatsAppEvent) {
  const webhookPath = EVENT_WORKFLOWS[event.event_type]
  if (!webhookPath) {
    console.error('[WhatsApp Event] Unknown event type:', event.event_type)
    return false
  }

  try {
    const res = await fetch(`${N8N_WEBHOOK}${webhookPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event.data),
    })

    return res.ok
  } catch (error) {
    console.error('[WhatsApp Event] Trigger failed:', error)
    return false
  }
}

export async function POST(req: Request) {
  try {
    const event = await req.json() as WhatsAppEvent

    if (!event.event_type || !event.phone) {
      return NextResponse.json(
        { success: false, error: 'event_type and phone required' },
        { status: 400 }
      )
    }

    const success = await triggerWorkflow(event)

    return NextResponse.json({
      success,
      event_type: event.event_type,
      triggered: success,
    })
  } catch (error) {
    console.error('[WhatsApp Event] Error:', error)
    console.error(`[Sentry] WhatsApp event failed: ${error}`)
    return NextResponse.json(
      { success: false, error: 'Failed to trigger event' },
      { status: 500 }
    )
  }
}

export async function triggerInvoiceCreated(tenantId: string, phone: string, invoiceData: {
  invoice_id: string
  customer_name: string
  amount: number
  items: string[]
}) {
  return triggerWorkflow({
    tenant_id: tenantId,
    event_type: 'invoice.created',
    phone,
    data: {
      ...invoiceData,
      message: `🧾 New Invoice Created\n\nCustomer: ${invoiceData.customer_name}\nAmount: ₹${invoiceData.amount}\nItems: ${invoiceData.items.join(', ')}`,
    },
  })
}

export async function triggerPaymentReminder(tenantId: string, phone: string, data: {
  customer_name: string
  invoice_id: string
  amount: number
  days_overdue: number
}) {
  return triggerWorkflow({
    tenant_id: tenantId,
    event_type: 'payment.reminder',
    phone,
    data: {
      ...data,
      message: `⏰ Payment Reminder\n\n${data.customer_name}, your payment of ₹${data.amount} is ${data.days_overdue} days overdue.`,
    },
  })
}