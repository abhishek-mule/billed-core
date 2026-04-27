import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'
import { generateId } from '@/lib/db/encryption'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit
    const search = searchParams.get('search') || ''
    const category = searchParams.get('category')
    const stockFilter = searchParams.get('stock')

    let whereClause = 'tenant_id = $1 AND is_active = true'
    const params: any[] = [session.tenantId]
    let paramIndex = 2

    if (search) {
      whereClause += ` AND (item_name ILIKE $${paramIndex} OR item_code ILIKE $${paramIndex})`
      params.push(`%${search}%`)
      paramIndex++
    }

    if (category) {
      whereClause += ` AND category = $${paramIndex}`
      params.push(category)
      paramIndex++
    }

    // Count total
    const countResult = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM products WHERE ${whereClause}`,
      params
    )
    const total = Number(countResult?.count) || 0

    // Get products
    const products = await query<any>(
      `SELECT * FROM products WHERE ${whereClause} ORDER BY item_name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    )

    return NextResponse.json({
      success: true,
      data: products.map(p => ({
        id: p.id,
        itemCode: p.item_code,
        itemName: p.item_name,
        hsnCode: p.hsn_code,
        gstRate: Number(p.gst_rate) || 18,
        rate: Number(p.rate || p.standard_rate) || 0,
        mrp: Number(p.mrp) || 0,
        stock: Number(p.stock_quantity) || 0,
        category: p.category,
        unit: p.unit,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    })

  } catch (error: any) {
    console.error('[Products List] Error:', error)
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { itemCode, itemName, hsnCode, gstRate, rate, mrp, category, unit, stock } = body

    if (!itemCode || !itemName) {
      return NextResponse.json({ error: 'Item code and name required' }, { status: 400 })
    }

    // Check if item code exists
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM products WHERE tenant_id = $1 AND item_code = $2',
      [session.tenantId, itemCode]
    )

    if (existing) {
      return NextResponse.json({ error: 'Item code already exists' }, { status: 409 })
    }

    const productId = generateId('ITEM')

    await query(
      `INSERT INTO products (id, tenant_id, item_code, item_name, hsn_code, gst_rate, rate, mrp, stock_quantity, category, unit, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW())`,
      [productId, session.tenantId, itemCode, itemName, hsnCode || '', String(gstRate || 18), String(rate || 0), String(mrp || 0), String(stock || 0), category || '', unit || 'pcs']
    )

    return NextResponse.json({
      success: true,
      id: productId,
      itemCode,
      itemName
    })

  } catch (error: any) {
    console.error('[Products Create] Error:', error)
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}