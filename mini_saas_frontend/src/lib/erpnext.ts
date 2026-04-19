export interface ERPNextConfig {
  site: string
  apiKey: string
  apiSecret: string
}

export interface Customer {
  name: string
  customer_name: string
  phone: string
  email?: string
  gstin?: string
  territory?: string
}

export interface Product {
  name: string
  item_code: string
  item_name: string
  stock_uom: string
  description?: string
  image?: string
  standard_rate: number
  income_account?: string
  expense_account?: string
  tax_category?: string
}

export interface InvoiceItem {
  item_code: string
  item_name?: string
  qty: number
  rate: number
  amount: number
  income_account?: string
  cost_center?: string
  tax_rate?: number
}

export interface InvoiceData {
  customer: string
  company: string
  do_not_submit?: boolean
  items: InvoiceItem[]
  tax_template?: string
  base_total?: number
  total?: number
  base_grand_total?: number
  grand_total?: number
  outstanding_amount?: number
  is_pos?: number
  payments?: PaymentEntry[]
}

export interface PaymentEntry {
  mode_of_payment: string
  amount: number
  account: string
}

export interface InvoiceResponse {
  name: string
  owner: string
  creation: string
  modified: string
  docstatus: number
  customer: string
  customer_name: string
  company: string
  total: number
  outstanding_amount: number
}

interface APIResponse {
  data?: any
  exception?: string
}

export class ERPNextClient {
  private config: ERPNextConfig
  private baseUrl: string

  constructor(config: ERPNextConfig) {
    this.config = config
    this.baseUrl = config.site.startsWith('http') ? config.site : `https://${config.site}`
  }

  private async request(endpoint: string, method: string = 'GET', body?: any): Promise<APIResponse> {
    const url = `${this.baseUrl}/api/method/${endpoint}`
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    if (this.config.apiKey && this.config.apiSecret) {
      const credentials = btoa(`${this.config.apiKey}:${this.config.apiSecret}`)
      headers['Authorization'] = `Basic ${credentials}`
    }

    const options: RequestInit = {
      method,
      headers,
    }

    if (body) {
      options.body = JSON.stringify(body)
    }

    try {
      const res = await fetch(url, options)
      const data = await res.json()
      
      if (data.exc) {
        throw new Error(data.exc)
      }
      
      return { data }
    } catch (error) {
      console.error(`[ERPNext] API Error:`, error)
      throw error
    }
  }

  async getCustomerByPhone(phone: string): Promise<Customer | null> {
    const cleanPhone = phone.replace(/\D/g, '')
    const response = await this.request(
      'frappe.client.get_value',
      'POST',
      {
        doctype: 'Customer',
        filters: { phone: ['like', `%${cleanPhone}%`] },
        fieldname: ['name', 'customer_name', 'phone', 'email', 'gstin', 'territory']
      }
    )
    
    return response.data?.message || null
  }

  async getCustomerByName(name: string): Promise<Customer[]> {
    const response = await this.request(
      'frappe.client.get_list',
      'POST',
      {
        doctype: 'Customer',
        filters: { customer_name: ['like', `%${name}%`] },
        fields: ['name', 'customer_name', 'phone', 'email', 'gstin'],
        limit: 20
      }
    )
    
    return response.data?.message || []
  }

  async createCustomer(data: Partial<Customer>): Promise<string> {
    const response = await this.request(
      'frappe.client.insert',
      'POST',
      {
        doc: {
          doctype: 'Customer',
          customer_type: 'Individual',
          customer_name: data.customer_name || data.name,
          phone: data.phone,
          email: data.email,
          gstin: data.gstin,
          territory: data.territory || 'India'
        }
      }
    )
    
    return response.data?.message?.name || ''
  }

  async searchProducts(query: string): Promise<Product[]> {
    const response = await this.request(
      'frappe.client.get_list',
      'POST',
      {
        doctype: 'Item',
        filters: [
          ['item_code', 'like', `%${query}%`],
          'OR',
          ['item_name', 'like', `%${query}%`]
        ],
        fields: [
          'name',
          'item_code',
          'item_name',
          'stock_uom',
          'standard_rate',
          'image'
        ],
        limit: 20
      }
    )
    
    return response.data?.message || []
  }

  async getProductByCode(itemCode: string): Promise<Product | null> {
    const response = await this.request(
      'frappe.client.get_value',
      'POST',
      {
        doctype: 'Item',
        filters: { item_code: itemCode },
        fieldname: [
          'name',
          'item_code',
          'item_name',
          'stock_uom',
          'standard_rate',
          'description',
          'image',
          'income_account',
          'expense_account'
        ]
      }
    )
    
    return response.data?.message || null
  }

  async getProductPriceList(): Promise<{item_code: string, price_list_rate: number}[]> {
    const response = await this.request(
      'frappe.client.get_list',
      'POST',
      {
        doctype: 'Item Price',
        filters: { price_list: 'Standard Selling' },
        fields: ['item_code', 'price_list_rate'],
        limit: 100
      }
    )
    
    return response.data?.message || []
  }

  async createInvoice(data: InvoiceData): Promise<InvoiceResponse> {
    const response = await this.request(
      'frappe.client.insert',
      'POST',
      { doc: { doctype: 'Sales Invoice', ...data } }
    )
    
    return response.data?.message || null
  }

  async submitInvoice(name: string): Promise<boolean> {
    const response = await this.request(
      'frappe.client.submit',
      'POST',
      { doc: { doctype: 'Sales Invoice', name } }
    )
    
    return !!response.data?.message
  }

  async getRecentInvoices(limit: number = 10): Promise<InvoiceResponse[]> {
    const response = await this.request(
      'frappe.client.get_list',
      'POST',
      {
        doctype: 'Sales Invoice',
        fields: [
          'name',
          'customer',
          'customer_name',
          'company',
          'total',
          'outstanding_amount',
          'docstatus',
          'creation'
        ],
        filters: { docstatus: ['!=', 2] },
        order_by: 'creation desc',
        limit
      }
    )
    
    return response.data?.message || []
  }

  async getTodayStats(): Promise<{
    sales: number
    invoices: number
    customers: number
  }> {
    const today = new Date().toISOString().split('T')[0]
    
    const [salesRes, invoicesRes] = await Promise.all([
      this.request('frappe.client.get_value', 'POST', {
        doctype: 'Sales Invoice',
        filters: { creation: ['>=', today] },
        fieldname: 'sum(total)'
      }),
      this.request('frappe.client.get_list', 'POST', {
        doctype: 'Sales Invoice',
        filters: { 
          creation: ['>=', today],
          docstatus: ['!=', 2]
        },
        limit: 0
      })
    ])

    return {
      sales: salesRes.data?.message || 0,
      invoices: invoicesRes.data?.message?.length || 0,
      customers: 0
    }
  }

  async getLowStockItems(threshold: number = 10): Promise<{item_code: string, actual_qty: number}[]> {
    const response = await this.request(
      'frappe.client.get_list',
      'POST',
      {
        doctype: 'Bin',
        filters: { actual_qty: ['<=', threshold] },
        fields: ['item_code', 'actual_qty'],
        limit: 10
      }
    )
    
    return response.data?.message || []
  }
}

export function getERPConfigFromSession(): ERPNextConfig | null {
  if (typeof window === 'undefined') return null
  
  const site = localStorage.getItem('erp_site')
  const apiKey = localStorage.getItem('erp_api_key')
  const apiSecret = localStorage.getItem('erp_api_secret')
  
  if (!site || !apiKey || !apiSecret) return null
  
  return { site, apiKey, apiSecret }
}

export function setERPConfig(config: ERPNextConfig): void {
  if (typeof window === 'undefined') return
  
  localStorage.setItem('erp_site', config.site)
  localStorage.setItem('erp_api_key', config.apiKey)
  localStorage.setItem('erp_api_secret', config.apiSecret)
}

export function clearERPConfig(): void {
  if (typeof window === 'undefined') return
  
  localStorage.removeItem('erp_site')
  localStorage.removeItem('erp_api_key')
  localStorage.removeItem('erp_api_secret')
}