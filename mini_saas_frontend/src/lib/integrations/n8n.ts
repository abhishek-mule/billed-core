export interface InvoiceCreatedEvent {
  invoiceId: string
  invoiceNumber: string
  tenantId: string
  customerName?: string
  customerPhone?: string
  total: number
  timestamp: string
}

export async function triggerInvoiceCreatedWorkflow(event: InvoiceCreatedEvent): Promise<void> {
  const webhookBase = process.env.N8N_WEBHOOK_URL
  if (!webhookBase) return

  const url = `${webhookBase.replace(/\/$/, '')}/invoice-created`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })

    if (!response.ok) {
      console.warn('[n8n] Invoice workflow returned non-OK status', response.status)
    }
  } catch (error) {
    console.warn('[n8n] Invoice workflow trigger failed', error)
  }
}
