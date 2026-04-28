import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const id = params.id
    const product = await queryOne<any>(
      'SELECT * FROM products WHERE id = $1 AND tenant_id = $2',
      [id, session.tenantId]
    )
    if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true, data: product })
  } catch (e) {
    console.error('[Product][GET] err', e)
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json()
    const id = params.id
    // Build a basic update set from provided fields; only allow known fields
    const allowed = ['item_code', 'item_name', 'hsn_code', 'gst_rate', 'rate', 'mrp', 'stock_quantity', 'category', 'unit', 'is_active']
    const fields: string[] = []
    const values: any[] = []
    let idx = 1
    for (const k of allowed) {
      if (k in body) {
        fields.push(`${k} = $${idx}`)
        values.push((body as any)[k])
        idx++
      }
    }
    if (fields.length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
    }
    values.push(id, session.tenantId)
    const sql = `UPDATE products SET ${fields.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx+1}`
    await query(sql, values)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[Product][PUT] err', e)
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const id = params.id
    await query('UPDATE products SET is_active = false WHERE id = $1 AND tenant_id = $2', [id, session.tenantId])
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[Product][DELETE] err', e)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
