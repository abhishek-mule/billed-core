import { NextResponse } from 'next/server'

const N8N_WEBHOOK = process.env.N8N_WEBHOOK_URL?.replace('setup-shop', 'daily-summary') || 'http://localhost:5678/webhook/daily-summary'

const ERP_URL = process.env.ERP_URL || 'http://localhost'

async function getDailyStats(tenantId: string) {
  const today = new Date().toISOString().split('T')[0]
  
  try {
    const [invoicesRes, pendingRes] = await Promise.all([
      fetch(`${ERP_URL}/api/resource/Sales Invoice?filters=[["creation", "like", "${today}%"], ["custom_tenant_id", "=", "${tenantId}"]]&fields=["sum(grand_total)", "count(name)", "customer_name"]`, {
        headers: { 'Authorization': `token ${process.env.ERP_API_KEY}:${process.env.ERP_API_SECRET}` },
      }),
      fetch(`${ERP_URL}/api/resource/Sales Invoice?filters=[["outstanding_amount", ">", 0], ["custom_tenant_id", "=", "${tenantId}"]]&fields=["sum(outstanding_amount)", "count(name)"]`, {
        headers: { 'Authorization': `token ${process.env.ERP_API_KEY}:${process.env.ERP_API_SECRET}` },
      }),
    ])

    const invoices = await invoicesRes.json()
    const pending = await pendingRes.json()

    return {
      todaySales: invoices.message?.sum?.grand_total || 0,
      todayInvoices: invoices.message?.count || 0,
      pendingAmount: pending.message?.sum?.outstanding_amount || 0,
      pendingCount: pending.message?.count || 0,
    }
  } catch (error) {
    console.error('[DailySummary] Stats fetch failed:', error)
    return { todaySales: 0, todayInvoices: 0, pendingAmount: 0, pendingCount: 0 }
  }
}

interface Merchant {
  name: string
  phone: string
  enabled: boolean
}

async function getActiveMerchants(): Promise<Merchant[]> {
  try {
    const res = await fetch(`${ERP_URL}/api/resource/Billed Tenant?filters=[["is_active", "=", 1]]&fields=["name", "shop_name", "phone"]`, {
      headers: { 'Authorization': `token ${process.env.ERP_API_KEY}:${process.env.ERP_API_SECRET}` },
    })
    const data = await res.json()
    return (data.message || []).map((t: any) => ({
      name: t.name,
      phone: t.phone,
      enabled: true,
    }))
  } catch (error) {
    console.error('[DailySummary] Tenant fetch failed:', error)
    return []
  }
}

async function sendDailySummary(merchant: Merchant, stats: any) {
  const message = `📊 Daily Summary - ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}

💰 Today: ₹${stats.todaySales.toLocaleString('en-IN')}
🧾 Invoices: ${stats.todayInvoices}
📋 Pending: ₹${stats.pendingAmount.toLocaleString('en-IN')} (${stats.pendingCount})

${stats.todayInvoices > 0 ? '✅ Great day!' : '💡 Create invoices to track payments'}

- BillZo`

  try {
    const res = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: merchant.phone,
        message,
        tenant_id: merchant.name,
      }),
    })
    return res.ok
  } catch (error) {
    console.error('[DailySummary] Send failed:', error)
    return false
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { tenantId, testOnly } = body as { tenantId?: string; testOnly?: boolean }

    if (tenantId) {
      const merchants = [{ name: tenantId, phone: '+919999999999', enabled: true }]
      const stats = await getDailyStats(tenantId)
      
      if (testOnly) {
        return NextResponse.json({
          success: true,
          stats,
          message: 'Test summary generated',
        })
      }

      const sent = await sendDailySummary(merchants[0], stats)
      return NextResponse.json({ success: sent })
    }

    const merchants = await getActiveMerchants()
    let successCount = 0
    let failCount = 0

    for (const merchant of merchants) {
      if (!merchant.enabled) continue
      
      const stats = await getDailyStats(merchant.name)
      const sent = await sendDailySummary(merchant, stats)
      
      if (sent) successCount++
      else failCount++
    }

    return NextResponse.json({
      success: true,
      processed: merchants.length,
      sent: successCount,
      failed: failCount,
    })
  } catch (error) {
    console.error('[DailySummary] Error:', error)
    return NextResponse.json({ success: false, error: 'Failed to send summaries' }, { status: 500 })
  }
}