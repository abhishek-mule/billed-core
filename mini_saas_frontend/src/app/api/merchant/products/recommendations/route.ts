import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'

interface Recommendation {
  product_id: string
  item_name: string
  item_code: string
  rate: number
  score: number
  reason: string
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('product_id')
    const limit = parseInt(searchParams.get('limit') || '5')

    const recommendations: Recommendation[] = []

    if (productId) {
      const currentProduct = await queryOne<Record<string, any>>(
        `SELECT id, item_name, item_code, category, rate, aliases
         FROM products WHERE id = $1 AND tenant_id = $2`,
        [productId, session.tenantId]
      )

      if (currentProduct) {
        const categoryProducts = await query<Record<string, any>>(
          `SELECT id, item_name, item_code, rate
           FROM products 
           WHERE tenant_id = $1 AND category = $2 AND id != $3 AND is_active = true
           ORDER BY item_name
           LIMIT 10`,
          [session.tenantId, currentProduct.category, productId]
        )

        for (const p of categoryProducts) {
          recommendations.push({
            product_id: p.id,
            item_name: p.item_name,
            item_code: p.item_code,
            rate: parseFloat(p.rate || '0'),
            score: 70 - Math.random() * 20,
            reason: 'Same category',
          })
        }
      }
    }

    const recentInvoices = await query<Record<string, any>>(
      `SELECT DISTINCT ON (item_code) 
       i.item_code, i.item_name, COUNT(*) as order_count
       FROM invoice_items i
       JOIN invoices inv ON i.invoice_id = inv.id
       WHERE inv.tenant_id = $1 AND inv.created_at > NOW() - INTERVAL '30 days'
       GROUP BY i.item_code, i.item_name
       ORDER BY i.item_code, order_count DESC
       LIMIT 10`,
      [session.tenantId]
    )

    for (const item of recentInvoices) {
      const exists = recommendations.some(r => r.item_code === item.item_code)
      if (!exists) {
        const product = await queryOne<Record<string, any>>(
          `SELECT id, item_name, item_code, rate
           FROM products 
           WHERE tenant_id = $1 AND item_code = $2 AND is_active = true`,
          [session.tenantId, item.item_code]
        )

        if (product) {
          recommendations.push({
            product_id: product.id,
            item_name: product.item_name,
            item_code: product.item_code,
            rate: parseFloat(product.rate || '0'),
            score: 60,
            reason: 'Frequently bought together',
          })
        }
      }
    }

    const topRated = await query<Record<string, any>>(
      `SELECT id, item_name, item_code, rate, stock_qty
       FROM products 
       WHERE tenant_id = $1 AND is_active = true AND stock_qty::numeric > 0
       ORDER BY stock_qty DESC
       LIMIT 5`,
      [session.tenantId]
    )

    for (const p of topRated) {
      const exists = recommendations.some(r => r.product_id === p.id)
      if (!exists && recommendations.length < limit) {
        recommendations.push({
          product_id: p.id,
          item_name: p.item_name,
          item_code: p.item_code,
          rate: parseFloat(p.rate || '0'),
          score: 50,
          reason: 'Popular in stock',
        })
      }
    }

    recommendations.sort((a, b) => b.score - a.score)
    const topRecommendations = recommendations.slice(0, limit)

    console.log(`[Recommendations] Generated ${topRecommendations.length} recommendations`)

    return NextResponse.json({
      success: true,
      recommendations: topRecommendations,
      count: topRecommendations.length,
    })

  } catch (error) {
    console.error('[Recommendations] Error:', error)
    return NextResponse.json({ error: 'Failed to get recommendations' }, { status: 500 })
  }
}