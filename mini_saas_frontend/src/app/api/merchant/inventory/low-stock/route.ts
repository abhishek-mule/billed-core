import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Default threshold is 5 if not specified in product settings
    const lowStockProducts = await query<any>(
      `SELECT id, item_name as name, stock_quantity as stock, category, unit, 
              COALESCE(CAST(metadata->>'low_stock_threshold' AS NUMERIC), 5) as threshold
       FROM products 
       WHERE tenant_id = $1 
         AND is_active = true 
         AND stock_quantity <= COALESCE(CAST(metadata->>'low_stock_threshold' AS NUMERIC), 5)
       ORDER BY stock_quantity ASC`,
      [session.tenantId]
    )

    return NextResponse.json({
      success: true,
      data: lowStockProducts.map(p => ({
        id: p.id,
        name: p.name,
        stock: Number(p.stock),
        threshold: Number(p.threshold),
        category: p.category,
        unit: p.unit
      }))
    })

  } catch (error: any) {
    console.error('[Low Stock API] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch low stock items' }, { status: 500 })
  }
}
