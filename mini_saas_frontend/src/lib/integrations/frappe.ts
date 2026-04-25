export interface FrappeCredentials {
  siteUrl: string
  apiKey: string
  apiSecret: string
}

export interface FrappeSalesInvoiceItem {
  item_code: string
  item_name?: string
  qty: number
  rate: number
  amount: number
}

export interface FrappeSalesInvoicePayload {
  customer: string
  customer_name: string
  company: string
  posting_date: string
  due_date: string
  items: FrappeSalesInvoiceItem[]
  custom_invoice_number: string
  custom_tenant_id: string
  remarks?: string
  is_pos?: number
  do_not_submit?: boolean
}

interface FrappeInsertResponse {
  data?: {
    name?: string
  }
}

function normalizeSiteUrl(siteUrl: string): string {
  if (siteUrl.startsWith('http://') || siteUrl.startsWith('https://')) {
    return siteUrl
  }
  return `https://${siteUrl}`
}

export async function createFrappeSalesInvoice(
  credentials: FrappeCredentials,
  payload: FrappeSalesInvoicePayload
): Promise<{ invoiceId: string }> {
  const baseUrl = normalizeSiteUrl(credentials.siteUrl)
  const response = await fetch(`${baseUrl}/api/resource/Sales Invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `token ${credentials.apiKey}:${credentials.apiSecret}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorPayload = await response.text().catch(() => '')
    throw new Error(`Frappe create invoice failed: ${response.status} ${errorPayload}`)
  }

  const json = (await response.json()) as FrappeInsertResponse
  const invoiceId = json.data?.name
  if (!invoiceId) {
    throw new Error('Frappe create invoice failed: missing invoice id')
  }

  return { invoiceId }
}
