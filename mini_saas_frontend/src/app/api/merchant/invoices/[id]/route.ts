import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const id = params.id
    const inv = await queryOne<any>(`SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2`, [id, session.tenantId])
    if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true, data: inv })
  } catch (e) {
    console.error('[Invoice][GET] err', e)
    return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json()
    const id = params.id
    const allowed = ['payment_status', 'notes', 'erp_sync_status']
    const sets: string[] = []
    const vals: any[] = []
    let idx = 1
    for (const k of allowed) {
      if (k in body) { sets.push(`${k} = $${idx}`); vals.push((body as any)[k]); idx++ }
    }
    if (sets.length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
    vals.push(id, session.tenantId)
    const sql = `UPDATE invoices SET ${sets.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx+1}`
    await query(sql, vals)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[Invoice][PUT] err', e)
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const id = params.id
    await query('DELETE FROM invoices WHERE id = $1 AND tenant_id = $2', [id, session.tenantId])
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[Invoice][DELETE] err', e)
    return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 })
  }
}
