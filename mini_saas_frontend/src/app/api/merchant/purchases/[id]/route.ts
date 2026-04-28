import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const invId = params.id
    const purchase = await queryOne<any>(`SELECT * FROM purchases WHERE id = $1 AND tenant_id = $2`, [invId, session.tenantId])
    if (!purchase) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true, data: purchase })
  } catch (e) {
    console.error('[Purchase][GET] err', e)
    return NextResponse.json({ error: 'Failed to fetch purchase' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json()
    const id = params.id
    const updates = [] as string[]
    const vals: any[] = []
    const allowed = ['status', 'notes', 'invoice_date', 'due_date']
    let idx = 1
    for (const k of allowed) {
      if (k in body) { updates.push(`${k} = $${idx}`); vals.push((body as any)[k]); idx++ }
    }
    if (updates.length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
    vals.push(id, session.tenantId)
    const sql = `UPDATE purchases SET ${updates.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx+1}`
    await query(sql, vals)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[Purchase][PUT] err', e)
    return NextResponse.json({ error: 'Failed to update purchase' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const id = params.id
    await query('DELETE FROM purchases WHERE id = $1 AND tenant_id = $2', [id, session.tenantId])
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[Purchase][DELETE] err', e)
    return NextResponse.json({ error: 'Failed to delete purchase' }, { status: 500 })
  }
}
