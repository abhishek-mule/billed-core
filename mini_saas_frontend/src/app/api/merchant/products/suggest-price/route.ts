import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

interface PriceHistory {
  date: string
  rate: number
}

interface PriceSuggestion {
  product_id: string
  item_name: string
  current_rate: number
  suggested_rate: number
  min_rate: number
  max_rate: number
  avg_rate: number
  margin_percent: number
  history: PriceHistory[]
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('product_id')

    if (!productId) {
      return NextResponse.json({ error: 'product_id required' }, { status: 400 })
    }

    const product = await queryOne<Record<string, any>>(
      `SELECT id, item_name, item_code, rate, mrp, standard_rate, category
       FROM products WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
      [productId, session.tenantId]
    )

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const currentRate = parseFloat(product.rate || '0')
    const mrp = parseFloat(product.mrp || '0')
    const costPrice = parseFloat(product.standard_rate || '0')

    const invoiceHistory = await query<Record<string, any>>(
      `SELECT i.rate, i.created_at as date
       FROM invoice_items i
       JOIN invoices inv ON i.invoice_id = inv.id
       WHERE i.item_code = $1 AND inv.tenant_id = $2 AND inv.created_at > NOW() - INTERVAL '90 days'
       ORDER BY inv.created_at DESC
       LIMIT 30`,
      [product.item_code, session.tenantId]
    )

    const rates = invoiceHistory.map(h => parseFloat(h.rate || '0')).filter(r => r > 0)
    const minRate = rates.length > 0 ? Math.min(...rates) : currentRate * 0.8
    const maxRate = rates.length > 0 ? Math.max(...rates) : currentRate * 1.2
    const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : currentRate

    const marginPercent = costPrice > 0 ? ((currentRate - costPrice) / costPrice) * 100 : 0

    const marketProducts = await query<Record<string, any>>(
      `SELECT AVG(rate::numeric) as market_avg, MIN(rate::numeric) as market_min, MAX(rate::numeric) as market_max
       FROM products 
       WHERE category = $1 AND tenant_id != $2 AND is_active = true`,
      [product.category, session.tenantId]
    )

    let suggestedRate = currentRate
    if (marketProducts.length > 0 && marketProducts[0].market_avg) {
      const marketAvg = parseFloat(marketProducts[0].market_avg)
      if (marketAvg > 0 && Math.abs(marketAvg - currentRate) / currentRate > 0.1) {
        suggestedRate = Math.round(marketAvg)
      }
    }

    if (mrp > 0 && suggestedRate > mrp) {
      suggestedRate = mrp
    }

    const suggestion: PriceSuggestion = {
      product_id: product.id,
      item_name: product.item_name,
      current_rate: currentRate,
      suggested_rate: suggestedRate,
      min_rate: Math.round(minRate),
      max_rate: Math.round(maxRate),
      avg_rate: Math.round(avgRate),
      margin_percent: Math.round(marginPercent * 10) / 10,
      history: invoiceHistory.slice(0, 10).map(h => ({
        date: h.date,
        rate: parseFloat(h.rate || '0'),
      })),
    }

    console.log(`[Price Suggestion] ${product.item_name}: current=${currentRate}, suggested=${suggestedRate}`)

    return NextResponse.json({
      success: true,
      suggestion,
    })

  } catch (error) {
    console.error('[Price Suggestion] Error:', error)
    return NextResponse.json({ error: 'Failed to get suggestion' }, { status: 500 })
  }
}