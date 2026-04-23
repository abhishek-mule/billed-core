import { NextResponse } from 'next/server'

const ERP_URL = process.env.ERP_URL || 'http://localhost'
const ERP_API_KEY = process.env.ERP_API_KEY || 'administrator'
const ERP_API_SECRET = process.env.ERP_API_SECRET || 'admin'

async function getSalesStats() {
  const today = new Date().toISOString().split('T')[0]
  
  try {
    const [invoicesRes, pendingRes] = await Promise.all([
      fetch(`${ERP_URL}/api/resource/Sales Invoice?fields=["sum(grand_total)","count(name)"]&filters=[[" posting_date", "=", "${today}"]]`, {
        headers: { 'Authorization': `token ${ERP_API_KEY}:${ERP_API_SECRET}` },
      }),
      fetch(`${ERP_URL}/api/resource/Sales Invoice?filters=[[" outstanding_amount", ">", 0]]`, {
        headers: { 'Authorization': `token ${ERP_API_KEY}:${ERP_API_SECRET}` },
      }),
    ])

    const invoices = await invoicesRes.json()
    const pending = await pendingRes.json()

    return {
      todaySales: invoices.message?.sum?.grand_total || 0,
      todayInvoices: invoices.message?.count || 0,
      pendingPayments: pending.message?.length || 0,
    }
  } catch (error) {
    console.error('[Stats] ERP fetch failed:', error)
    return { todaySales: 0, todayInvoices: 0, pendingPayments: 0 }
  }
}

async function getLowStockCount() {
  try {
    const res = await fetch(`${ERP_URL}/api/resource/Item?filters=[[" reorder_level", ">", 0]]&fields=["name", "actual_qty", "reorder_level"]`, {
      headers: { 'Authorization': `token ${ERP_API_KEY}:${ERP_API_SECRET}` },
    })
    
    const data = await res.json()
    const lowStock = (data.message || []).filter((item: any) => 
      item.actual_qty <= item.reorder_level
    ).length
    
    return lowStock
  } catch (error) {
    console.error('[Stats] Low stock fetch failed:', error)
    return 0
  }
}

export async function GET() {
  const [salesStats, lowStockCount] = await Promise.all([
    getSalesStats(),
    getLowStockCount(),
  ])

  return NextResponse.json({
    todaySales: salesStats.todaySales,
    todayInvoices: salesStats.todayInvoices,
    pendingPayments: salesStats.pendingPayments,
    lowStockCount,
  })
}