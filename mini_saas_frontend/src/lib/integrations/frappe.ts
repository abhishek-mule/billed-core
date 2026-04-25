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

export enum ERPMode {
  LIVE = 'live',
  MOCK = 'mock'
}

export async function createFrappeSalesInvoice(
  credentials: FrappeCredentials,
  payload: FrappeSalesInvoicePayload
): Promise<{ invoiceId: string }> {
  const ERP_MODE = (process.env.ERP_MODE || 'live') as ERPMode

  // Explicit Mock Mode
  if (ERP_MODE === ERPMode.MOCK) {
    console.warn('⚠️ [ERP MOCK] Simulation used for invoice:', payload.custom_invoice_number)
    // In mock mode, we still simulate a delay to maintain UX consistency
    await new Promise(resolve => setTimeout(resolve, 800))
    return { invoiceId: `MOCK-SINV-${Math.floor(Math.random() * 100000)}` }
  }

  // Live Mode: No Fallback
  const baseUrl = normalizeSiteUrl(credentials.siteUrl)
  
  try {
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
      console.error('❌ [ERP FAILURE]', { status: response.status, error: errorPayload })
      
      // We throw a specific error so the orchestrator can mark it as PENDING/RETRY
      throw new Error(`ERP_UNAVAILABLE: ${response.status}`)
    }

    const json = (await response.json()) as FrappeInsertResponse
    const invoiceId = json.data?.name
    
    if (!invoiceId) {
      throw new Error('ERP_INVALID_RESPONSE: missing invoice id')
    }

    return { invoiceId }
  } catch (error) {
    // Critical: Do NOT fallback to mock here. Let the error propagate.
    console.error('🚨 [ERP CONNECTION ERROR]', error)
    throw error
  }
}
