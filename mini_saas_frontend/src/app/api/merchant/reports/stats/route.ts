import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'month'
    
    // Calculate date range based on period
    const now = new Date()
    let startDate = new Date()
    
    switch (period) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0))
        break
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7))
        break
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1))
        break
      case 'quarter':
        startDate = new Date(now.setMonth(now.getMonth() - 3))
        break
      case 'year':
        startDate = new Date(now.setFullYear(now.getFullYear() - 1))
        break
      default:
        startDate = new Date(now.setMonth(now.getMonth() - 1))
    }

    // Get basic sales statistics
    const salesStats = await queryOne(`
      SELECT 
        COUNT(*) as total_invoices,
        COALESCE(SUM(grand_total), 0) as total_sales,
        COALESCE(SUM(grand_total) / NULLIF(COUNT(*), 0), 0) as average_order_value,
        COALESCE(SUM(CASE WHEN payment_status = 'UNPAID' THEN outstanding_amount ELSE 0 END), 0) as pending_payments
      FROM invoices 
      WHERE tenant_id = $1 
        AND created_at >= $2
        AND created_at <= NOW()
    `, [session.tenantId, startDate])

    // Get GST collected
    const gstStats = await queryOne(`
      SELECT 
        COALESCE(SUM(cgst), 0) as cgst,
        COALESCE(SUM(sgst), 0) as sgst,
        COALESCE(SUM(igst), 0) as igst
      FROM invoices 
      WHERE tenant_id = $1 
        AND created_at >= $2
        AND created_at <= NOW()
    `, [session.tenantId, startDate])

    // Get top selling products
    const topProducts = await query(`
      SELECT 
        ii.item_name,
        SUM(ii.quantity) as total_quantity,
        SUM(ii.amount) as total_revenue
      FROM invoice_items ii
      INNER JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.tenant_id = $1 
        AND i.created_at >= $2
        AND i.created_at <= NOW()
      GROUP BY ii.item_name
      ORDER BY total_revenue DESC
      LIMIT 10
    `, [session.tenantId, startDate])

    // Get low stock items
    const lowStockItems = await query(`
      SELECT 
        item_name,
        item_code,
        stock_qty,
        reorder_level
      FROM products 
      WHERE tenant_id = $1 
        AND is_active = true
        AND stock_qty <= reorder_level
      ORDER BY stock_qty ASC
      LIMIT 10
    `, [session.tenantId])

    // Get active customers
    const activeCustomers = await queryOne(`
      SELECT COUNT(DISTINCT customer_id) as active_count
      FROM invoices 
      WHERE tenant_id = $1 
        AND created_at >= $2
        AND created_at <= NOW()
    `, [session.tenantId, startDate])

    // Get sales trend data (daily)
    const salesTrend = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as invoices,
        SUM(grand_total) as revenue
      FROM invoices 
      WHERE tenant_id = $1 
        AND created_at >= $2
        AND created_at <= NOW()
      GROUP BY DATE(created_at)
      ORDER BY date ASC
      LIMIT 30
    `, [session.tenantId, startDate])

    // Get payment status breakdown
    const paymentBreakdown = await query(`
      SELECT 
        payment_status,
        COUNT(*) as count,
        SUM(grand_total) as total_amount
      FROM invoices 
      WHERE tenant_id = $1 
        AND created_at >= $2
        AND created_at <= NOW()
      GROUP BY payment_status
    `, [session.tenantId, startDate])

    // Get top customers by revenue
    const topCustomers = await query(`
      SELECT 
        customer_name,
        customer_phone,
        COUNT(*) as total_orders,
        SUM(grand_total) as total_spent
      FROM invoices 
      WHERE tenant_id = $1 
        AND created_at >= $2
        AND created_at <= NOW()
      GROUP BY customer_name, customer_phone
      ORDER BY total_spent DESC
      LIMIT 10
    `, [session.tenantId, startDate])

    return NextResponse.json({
      success: true,
      period,
      dateRange: {
        start: startDate.toISOString(),
        end: new Date().toISOString()
      },
      stats: {
        totalSales: Number(salesStats?.total_sales || 0),
        totalInvoices: Number(salesStats?.total_invoices || 0),
        averageOrderValue: Number(salesStats?.average_order_value || 0),
        pendingPayments: Number(salesStats?.pending_payments || 0),
        gstCollected: {
          cgst: Number(gstStats?.cgst || 0),
          sgst: Number(gstStats?.sgst || 0),
          igst: Number(gstStats?.igst || 0)
        },
        activeCustomers: Number(activeCustomers?.active_count || 0),
        lowStockItems: lowStockItems.length
      },
      topSellingProducts: topProducts.map((p: any) => ({
        name: p.item_name,
        quantity: Number(p.total_quantity),
        revenue: Number(p.total_revenue)
      })),
      lowStockItems: lowStockItems.map((item: any) => ({
        name: item.item_name,
        code: item.item_code,
        stock: Number(item.stock_qty),
        reorderLevel: Number(item.reorder_level)
      })),
      salesTrend: salesTrend.map((t: any) => ({
        date: t.date,
        invoices: Number(t.invoices),
        revenue: Number(t.revenue)
      })),
      paymentBreakdown: paymentBreakdown.map((p: any) => ({
        status: p.payment_status,
        count: Number(p.count),
        amount: Number(p.total_amount)
      })),
      topCustomers: topCustomers.map((c: any) => ({
        name: c.customer_name,
        phone: c.customer_phone,
        orders: Number(c.total_orders),
        spent: Number(c.total_spent)
      }))
    })

  } catch (error) {
    console.error('[Reports Stats] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch reports statistics' }, { status: 500 })
  }
}