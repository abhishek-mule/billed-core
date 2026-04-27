import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'
import { generateId } from '@/lib/db/encryption'

export const dynamic = 'force-dynamic'

// Stock reservation timeout: 10 minutes
const RESERVATION_TTL_MS = 10 * 60 * 1000

// GET products list
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

    let whereClause = 'tenant_id = $1 AND is_active = true'
    const params: any[] = [session.tenantId]
    let paramIndex = 2

    if (search) {
      whereClause += ` AND (item_name ILIKE $${paramIndex} OR item_code ILIKE $${paramIndex})`
      params.push(`%${search}%`)
      paramIndex++
    }

    // Get reserved quantities for this session
    const now = Date.now()
    const reserved = await query<{ product_id: string, total_reserved: string }>(
      `SELECT product_id, SUM(quantity::numeric) as total_reserved 
       FROM stock_reservations 
       WHERE tenant_id = $1 AND expires_at > NOW() 
       GROUP BY product_id`,
      [session.tenantId]
    )

    const reservedMap = new Map(reserved.map(r => [r.product_id, parseFloat(r.total_reserved)]))

    const countResult = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM products WHERE ${whereClause}`,
      params
    )
    const total = Number(countResult?.count) || 0

    const products = await query<any>(
      `SELECT * FROM products WHERE ${whereClause} ORDER BY item_name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    )

    return NextResponse.json({
      success: true,
      data: products.map(p => {
        const reservedQty = Number(reservedMap.get(p.id)) || 0
        const availableStock = Math.max(0, Number(p.stock_quantity || 0) - reservedQty)
        return {
          id: p.id,
          itemCode: p.item_code,
          itemName: p.item_name,
          hsnCode: p.hsn_code,
          gstRate: Number(p.gst_rate) || 18,
          rate: Number(p.rate || p.standard_rate) || 0,
          mrp: Number(p.mrp) || 0,
          stock: Number(p.stock_quantity) || 0,
          reserved: reservedQty,
          available: availableStock,
          category: p.category,
          unit: p.unit,
        }
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    })

  } catch (error: any) {
    console.error('[Products List] Error:', error)
    return NextResponse.json({ error: 'Failed to load products' }, { status: 500 })
  }
}

// POST create product
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

    return NextResponse.json({ success: true, id: productId, itemCode, itemName })

  } catch (error: any) {
    console.error('[Products Create] Error:', error)
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}

// Reserve stock (called when adding to cart)
export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { productId, quantity, action } = body // action: 'reserve' | 'release' | 'confirm'

    if (!productId || !quantity) {
      return NextResponse.json({ error: 'Product ID and quantity required' }, { status: 400 })
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS)

    if (action === 'reserve') {
      // Check current stock
      const product = await queryOne<{ stock_quantity: string }>(
        'SELECT stock_quantity FROM products WHERE id = $1 AND tenant_id = $2',
        [productId, session.tenantId]
      )

      if (!product) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 })
      }

      const currentStock = parseFloat(product.stock_quantity) || 0
      
      // Check existing reservations
      const reserved = await queryOne<{ reserved: string }>(
        `SELECT COALESCE(SUM(quantity), 0) as reserved 
         FROM stock_reservations 
         WHERE product_id = $1 AND tenant_id = $2 AND expires_at > NOW()`,
        [productId, session.tenantId]
      )
      
      const reservedQty = parseFloat(reserved?.reserved) || 0
      const availableStock = Math.max(0, currentStock - reservedQty)

      if (quantity > availableStock) {
        return NextResponse.json({ 
          error: 'Insufficient stock',
          available: availableStock,
          requested: quantity 
        }, { status: 400 })
      }

      // Create reservation
      const reservationId = generateId('RES')
      await query(
        `INSERT INTO stock_reservations (id, tenant_id, product_id, session_id, quantity, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [reservationId, session.tenantId, productId, session.userId, quantity, expiresAt]
      )

      return NextResponse.json({
        success: true,
        reservationId,
        expiresAt: expiresAt.toISOString(),
        available: availableStock - quantity
      })

    } else if (action === 'release') {
      // Release reservation
      await query(
        `DELETE FROM stock_reservations 
         WHERE product_id = $1 AND session_id = $2 AND expires_at > NOW()`,
        [productId, session.userId]
      )

      return NextResponse.json({ success: true })

    } else if (action === 'confirm') {
      // Confirm sale - deduct stock and clear reservation
      await query(
        `UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`,
        [quantity, productId]
      )

      await query(
        `DELETE FROM stock_reservations 
         WHERE product_id = $1 AND session_id = $2`,
        [productId, session.userId]
      )

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error: any) {
    console.error('[Stock Reservation] Error:', error)
    return NextResponse.json({ error: 'Failed to manage stock' }, { status: 500 })
  }
}