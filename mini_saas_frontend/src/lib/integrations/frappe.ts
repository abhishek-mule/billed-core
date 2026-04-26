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

async function makeErpRequest<T>(
  url: string,
  options: RequestInit,
  operationName: string
): Promise<T> {
  const { callWithCircuitBreaker, ERP_CIRCUIT } = await import('@/lib/circuits')
  
  return callWithCircuitBreaker(async () => {
    const response = await fetch(url, options)
    
    if (!response.ok) {
      const errorPayload = await response.text().catch(() => '')
      throw new Error(`ERP_ERROR: ${response.status} - ${errorPayload}`)
    }
    
    return response.json()
  }, ERP_CIRCUIT) as Promise<T>
}

export async function createFrappeSalesInvoice(
  credentials: FrappeCredentials,
  payload: FrappeSalesInvoicePayload
): Promise<{ invoiceId: string }> {
  const ERP_MODE = (process.env.ERP_MODE || 'live') as ERPMode

  if (ERP_MODE === ERPMode.MOCK) {
    console.warn('⚠️ [ERP MOCK] Simulation used for invoice:', payload.custom_invoice_number)
    await new Promise(resolve => setTimeout(resolve, 800))
    return { invoiceId: `MOCK-SINV-${Math.floor(Math.random() * 100000)}` }
  }

  const baseUrl = normalizeSiteUrl(credentials.siteUrl)
  
  try {
    const response = await makeErpRequest(
      `${baseUrl}/api/resource/Sales Invoice`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `token ${credentials.apiKey}:${credentials.apiSecret}`,
        },
        body: JSON.stringify(payload),
      },
      'createSalesInvoice'
    )

    const json = response as FrappeInsertResponse
    const invoiceId = json.data?.name
    
    if (!invoiceId) {
      throw new Error('ERP_INVALID_RESPONSE: missing invoice id')
    }

    return { invoiceId }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    
    if (message.includes('Circuit breaker OPEN')) {
      throw new Error(`ERP_CIRCUIT_OPEN: ${message}`)
    }
    
    console.error('🚨 [ERP CONNECTION ERROR]', error)
    throw error
  }
}
