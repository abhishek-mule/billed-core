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
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  })
}
