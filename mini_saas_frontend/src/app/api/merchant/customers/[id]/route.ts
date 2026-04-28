import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const id = params.id
    const customer = await queryOne<any>(
      'SELECT * FROM customers WHERE id = $1 AND tenant_id = $2',
      [id, session.tenantId]
    )
    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true, data: customer })
  } catch (e) {
    console.error('[Customer][GET] err', e)
    return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json()
    const id = params.id
    const allowed = ['customer_name', 'phone', 'email', 'gstin', 'billing_address', 'shipping_address', 'is_active']
    const updates: string[] = []
    const values: any[] = []
    let idx = 1
    for (const k of allowed) {
      if (k in body) {
        updates.push(`${k} = $${idx}`)
        values.push((body as any)[k])
        idx++
      }
    }
    if (updates.length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
    }
    values.push(id, session.tenantId)
    const sql = `UPDATE customers SET ${updates.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx+1}`
    await query(sql, values)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[Customer][PUT] err', e)
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const id = params.id
    await query('UPDATE customers SET is_active = false WHERE id = $1 AND tenant_id = $2', [id, session.tenantId])
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[Customer][DELETE] err', e)
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 })
  }
}
