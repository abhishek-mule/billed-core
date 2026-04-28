import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'
import { generateId } from '@/lib/db/encryption'

export const dynamic = 'force-dynamic'

// Search customers
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('q') || searchParams.get('search') || ''
    const limit = parseInt(searchParams.get('limit') || '20')

    let whereClause = 'tenant_id = $1 AND is_active = true'
    const params: any[] = [session.tenantId]
    let paramIndex = 2

    if (search) {
      whereClause += ` AND (customer_name ILIKE $${paramIndex} OR phone ILIKE $${paramIndex} OR gstin ILIKE $${paramIndex})`
      params.push(`%${search}%`)
      paramIndex++
    }

    const customers = await query<any>(
      `SELECT * FROM customers WHERE ${whereClause} ORDER BY customer_name ASC LIMIT $${paramIndex}`,
      [...params, limit]
    )

    // Get total sales for each customer
    const customerIds = customers.map(c => c.id)
    let salesData: Record<string, number> = {}
    
    if (customerIds.length > 0) {
      const sales = await query<{ customer_id: string, total: string }>(
        `SELECT customer_id, SUM(total::numeric) as total 
         FROM invoices 
         WHERE customer_id = ANY($1) AND status = 'PAID' 
         GROUP BY customer_id`,
        [customerIds]
      )
      salesData = Object.fromEntries(sales.map(s => [s.customer_id, parseFloat(s.total) || 0]))
    }

    return NextResponse.json({
      success: true,
      data: customers.map(c => ({
        id: c.id,
        name: c.customer_name,
        phone: c.phone,
        email: c.email,
        gstin: c.gstin,
        billingAddress: c.billing_address,
        shippingAddress: c.shipping_address,
        totalSales: salesData[c.id] || 0
      }))
    })

  } catch (error: any) {
    console.error('[Customer Search] Error:', error)
    return NextResponse.json({ error: 'Failed to search customers' }, { status: 500 })
  }
}

// Create customer
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { customerName, phone, email, gstin, billingAddress, shippingAddress } = body

    if (!customerName) {
      return NextResponse.json({ error: 'Customer name required' }, { status: 400 })
    }

    // Check for duplicate phone
    if (phone) {
      const existing = await queryOne<{ id: string }>(
        'SELECT id FROM customers WHERE tenant_id = $1 AND phone = $2 AND is_active = true',
        [session.tenantId, phone]
      )
      if (existing) {
        return NextResponse.json({ error: 'Customer with this phone already exists' }, { status: 409 })
      }
    }

    const customerId = generateId('CUST')

    await query(
      `INSERT INTO customers (id, tenant_id, customer_name, phone, email, gstin, billing_address, shipping_address, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW())`,
      [customerId, session.tenantId, customerName, phone || '', email || '', gstin || '', billingAddress || '', shippingAddress || '']
    )

    return NextResponse.json({
      success: true,
      id: customerId,
      name: customerName,
      phone
    })

  } catch (error: any) {
    console.error('[Customer Create] Error:', error)
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 })
  }
}