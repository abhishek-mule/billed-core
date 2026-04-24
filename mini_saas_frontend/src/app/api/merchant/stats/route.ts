import { NextResponse } from 'next/server'
import { withSessionAuth, getTenantApiCredentials, SessionData } from '@/lib/session'

const ERP_URL = process.env.ERP_URL || 'http://localhost'
const ERP_API_KEY = process.env.ERP_API_KEY || 'administrator'
const ERP_API_SECRET = process.env.ERP_API_SECRET || 'admin'

async function getSalesStats(tenantId: string, creds: any) {
  const today = new Date().toISOString().split('T')[0]
  
  const apiKey = creds?.apiKey || ERP_API_KEY
  const apiSecret = creds?.apiSecret || ERP_API_SECRET
  
  try {
    const [invoicesRes, pendingRes] = await Promise.all([
      fetch(`${ERP_URL}/api/resource/Sales Invoice?fields=["sum(grand_total)","count(name)"]&filters=[[" posting_date", "=", "${today}"], ["custom_tenant_id", "=", "${tenantId}"]]`, {
        headers: { 'Authorization': `token ${apiKey}:${apiSecret}` },
      }),
      fetch(`${ERP_URL}/api/resource/Sales Invoice?filters=[[" outstanding_amount", ">", 0], ["custom_tenant_id", "=", "${tenantId}"]]`, {
        headers: { 'Authorization': `token ${apiKey}:${apiSecret}` },
      }),
    ])

    const invoices = await invoicesRes.json()
    const pendingArr = await pendingRes.json()

    const pendingList = Array.isArray(pendingArr.message) ? pendingArr.message : []
    const pendingSum = pendingList.reduce((sum: number, inv: any) => sum + (inv.outstanding_amount || 0), 0)

    return {
      todaySales: invoices.message?.sum?.grand_total || 0,
      todayInvoices: invoices.message?.count || 0,
      pendingPayments: pendingSum,
      pendingCount: pendingList.length,
    }
  } catch (error) {
    console.error('[Stats] ERP fetch failed:', error)
    return { todaySales: 0, todayInvoices: 0, pendingPayments: 0, pendingCount: 0 }
  }
}

async function getCustomerCount(tenantId: string, creds: any) {
  const apiKey = creds?.apiKey || ERP_API_KEY
  const apiSecret = creds?.apiSecret || ERP_API_SECRET
  
  try {
    const res = await fetch(`${ERP_URL}/api/resource/Customer?filters=[["custom_tenant_id", "=", "${tenantId}"]]&fields=["count(name)"]`, {
      headers: { 'Authorization': `token ${apiKey}:${apiSecret}` },
    })
    const data = await res.json()
    return data.message?.count || 0
  } catch {
    return 0
  }
}

async function getLowStockCount(tenantId: string, creds: any) {
  const apiKey = creds?.apiKey || ERP_API_KEY
  const apiSecret = creds?.apiSecret || ERP_API_SECRET
  
  try {
    const res = await fetch(`${ERP_URL}/api/resource/Item?filters=[[" reorder_level", ">", 0], ["custom_tenant_id", "=", "${tenantId}"]]&fields=["name", "actual_qty", "reorder_level"]`, {
      headers: { 'Authorization': `token ${apiKey}:${apiSecret}` },
    })
    const data = await res.json()
    const items = Array.isArray(data.message) ? data.message : []
    return items.filter((item: any) => (item.actual_qty || 0) <= (item.reorder_level || 0)).length
  } catch {
    return 0
  }
}

async function handleStats(request: Request, session: SessionData) {
  const { tenantId } = session
  const creds = await getTenantApiCredentials(tenantId)

  const [salesStats, customerCount, lowStockCount] = await Promise.all([
    getSalesStats(tenantId, creds),
    getCustomerCount(tenantId, creds),
    getLowStockCount(tenantId, creds),
  ])

  return NextResponse.json({
    todaySales: salesStats.todaySales,
    todayInvoices: salesStats.todayInvoices,
    pendingPayments: salesStats.pendingPayments,
    pendingCount: salesStats.pendingCount,
    customerCount,
    lowStockCount,
  })
}

export const GET = await withSessionAuth(handleStats)