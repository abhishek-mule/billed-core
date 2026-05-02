import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { tenantId } = session

    // Get today's revenue
    const revenueResult = await queryOne<{ total: string }>(
      `SELECT SUM(total::numeric) as total 
       FROM invoices 
       WHERE tenant_id = $1 AND invoice_date = CURRENT_DATE`,
      [tenantId]
    )

    // Get today's invoice count
    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count 
       FROM invoices 
       WHERE tenant_id = $1 AND invoice_date = CURRENT_DATE`,
      [tenantId]
    )

    // Get sync status counts (today)
    const syncStats = await query<{ status: string, count: string }>(
      `SELECT erp_sync_status as status, COUNT(*) as count 
       FROM invoices 
       WHERE tenant_id = $1 AND invoice_date = CURRENT_DATE 
       GROUP BY erp_sync_status`,
      [tenantId]
    )

    // Get total failed count (all time)
    const totalFailedResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM invoices WHERE tenant_id = $1 AND erp_sync_status = 'FAILED'`,
      [tenantId]
    )

    // Get recent invoices
    const recentInvoices = await query<any>(
      `SELECT id, invoice_number, customer_name, total, erp_sync_status, created_at 
       FROM invoices 
       WHERE tenant_id = $1 
       ORDER BY created_at DESC 
       LIMIT 5`,
      [tenantId]
    )

    // Get today's cash flow breakdown
    const cashCollectedResult = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(total::numeric), 0) as total 
       FROM invoices 
       WHERE tenant_id = $1 AND invoice_date = CURRENT_DATE AND payment_mode IN ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER')`,
      [tenantId]
    )

    const creditGivenResult = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(total::numeric), 0) as total 
       FROM invoices 
       WHERE tenant_id = $1 AND invoice_date = CURRENT_DATE AND payment_mode = 'CREDIT'`,
      [tenantId]
    )

    const pendingCollectionsResult = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(total::numeric), 0) as total 
       FROM invoices 
       WHERE tenant_id = $1 AND payment_mode = 'CREDIT' AND status NOT IN ('PAID', 'CANCELLED', 'VOIDED')`,
      [tenantId]
    )

    // Get inventory health data
    const lowStockItems = await query<any>(
      `SELECT id, item_name, stock_qty, unit, standard_rate
       FROM products 
       WHERE tenant_id = $1 AND is_active = true AND stock_qty < 20
       ORDER BY stock_qty ASC
       LIMIT 10`,
      [tenantId]
    )

    // Get slow-moving items (not sold in 30 days)
    const slowMovingItems = await query<any>(
      `SELECT p.id, p.item_name, p.stock_qty, p.unit, p.standard_rate,
        MAX(i.created_at) as last_sold_date,
        EXTRACT(DAY FROM (NOW() - MAX(i.created_at))) as days_since_sale
       FROM products p
       LEFT JOIN invoice_items ii ON p.item_code = ii.item_code
       LEFT JOIN invoices i ON ii.invoice_id = i.id AND i.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1 AND p.is_active = true AND p.stock_qty > 0
       GROUP BY p.id, p.item_name, p.stock_qty, p.unit, p.standard_rate
       HAVING MAX(i.created_at) IS NULL OR MAX(i.created_at) < NOW() - INTERVAL '30 days'
       ORDER BY days_since_sale DESC NULLS LAST
       LIMIT 5`,
      [tenantId]
    )

    // Get receivables aging (top debtors)
    const topDebtors = await query<any>(
      `SELECT 
        c.id as customer_id,
        c.customer_name,
        c.phone,
        COALESCE(SUM(i.total::numeric), 0) as amount,
        MIN(i.created_at) as first_due_date,
        MAX(i.created_at) as last_due_date,
        EXTRACT(DAY FROM (NOW() - MAX(i.created_at))) as days_overdue,
        COUNT(i.id) as invoice_count
       FROM customers c
       INNER JOIN invoices i ON c.id = i.customer_id
       WHERE c.tenant_id = $1 
         AND i.tenant_id = $1
         AND i.payment_mode = 'CREDIT'
         AND i.status NOT IN ('PAID', 'CANCELLED', 'VOIDED')
       GROUP BY c.id, c.customer_name, c.phone
       ORDER BY amount DESC, days_overdue DESC
       LIMIT 10`,
      [tenantId]
    )

    // Get sales trend (last 7 days)
    const salesTrend = await query<any>(
      `SELECT 
         DATE(created_at) as date,
         SUM(total::numeric) as revenue
       FROM invoices 
       WHERE tenant_id = $1 
         AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [tenantId]
    )

    // Get purchases trend (last 7 days)
    const purchasesTrend = await query<any>(
      `SELECT 
         DATE(created_at) as date,
         SUM(total::numeric) as amount
       FROM purchases 
       WHERE tenant_id = $1 
         AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [tenantId]
    )

    // Get total purchases (this month)
    const totalPurchasesResult = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(total::numeric), 0) as total 
       FROM purchases 
       WHERE tenant_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE)`,
      [tenantId]
    )

    // Get unpaid invoices count and amount
    const unpaidInvoicesResult = await queryOne<{ count: string, total: string }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(total::numeric), 0) as total 
       FROM invoices 
       WHERE tenant_id = $1 AND payment_mode = 'CREDIT' AND status NOT IN ('PAID', 'CANCELLED', 'VOIDED')`,
      [tenantId]
    )

    // Get pending purchases count
    const pendingPurchasesResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count 
       FROM purchases 
       WHERE tenant_id = $1 AND status = 'DRAFT'`,
      [tenantId]
    )

    const cashCollected = parseFloat(cashCollectedResult?.total || '0')
    const creditGiven = parseFloat(creditGivenResult?.total || '0')
    const pendingCollections = parseFloat(pendingCollectionsResult?.total || '0')
    const todaysCash = cashCollected - creditGiven

    const stats = {
      revenue: parseFloat(revenueResult?.total || '0'),
      invoiceCount: parseInt(countResult?.count || '0'),
      syncedCount: parseInt(syncStats.find(s => s.status === 'SYNCED')?.count || '0'),
      failedCount: parseInt(syncStats.find(s => s.status === 'FAILED')?.count || '0'),
      pendingCount: parseInt(syncStats.find(s => s.status === 'PENDING')?.count || '0'),
      totalFailedCount: parseInt(totalFailedResult?.count || '0'),
      // New cash flow metrics
      todaysCash,
      cashCollected,
      creditGiven,
      pendingCollections,
      totalPurchases: parseFloat(totalPurchasesResult?.total || '0'),
      unpaidCount: parseInt(unpaidInvoicesResult?.count || '0'),
      unpaidAmount: parseFloat(unpaidInvoicesResult?.total || '0'),
      pendingPurchasesCount: parseInt(pendingPurchasesResult?.count || '0'),
      creditInvoiceCount: parseInt(countResult?.count || '0') - parseInt(syncStats.find(s => s.status === 'SYNCED')?.count || '0')
    }

    return NextResponse.json({
      success: true,
      stats,
      recentInvoices: recentInvoices.map(inv => ({
        id: inv.id,
        number: inv.invoice_number,
        party: inv.customer_name,
        amount: parseFloat(inv.total),
        status: inv.erp_sync_status.toLowerCase(),
        date: inv.created_at
      })),
      // New dashboard data
      inventoryHealth: {
        lowStockItems: lowStockItems.map(item => ({
          id: item.id,
          name: item.item_name,
          stock: parseFloat(item.stock_qty),
          unit: item.unit,
          rate: parseFloat(item.standard_rate)
        })),
        slowMovingItems: slowMovingItems.map(item => ({
          id: item.id,
          name: item.item_name,
          stock: parseFloat(item.stock_qty),
          unit: item.unit,
          daysSinceSale: item.days_since_sale ? parseInt(item.days_since_sale) : null,
          lastSoldDate: item.last_sold_date
        }))
      },
      receivables: {
        topDebtors: topDebtors.map(debtor => ({
          customerId: debtor.customer_id,
          name: debtor.customer_name,
          phone: debtor.phone,
          amount: parseFloat(debtor.amount),
          daysOverdue: parseInt(debtor.days_overdue) || 0,
          invoiceCount: parseInt(debtor.invoice_count),
          dueDate: debtor.last_due_date
        })),
        totalPending: pendingCollections
      },
      trends: {
        sales: salesTrend.map(t => ({ date: t.date, revenue: parseFloat(t.revenue) })),
        purchases: purchasesTrend.map(t => ({ date: t.date, amount: parseFloat(t.amount) }))
      }
    })

  } catch (error: any) {
    console.error('[Dashboard Stats] Error:', error)
    return NextResponse.json({ error: 'Failed to load dashboard stats' }, { status: 500 })
  }
}