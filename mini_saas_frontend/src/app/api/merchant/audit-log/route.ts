import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query } from '@/lib/db/client'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('invoice_id')
    const limit = parseInt(searchParams.get('limit') || '50')

    let whereClause = 'tenant_id = $1'
    const params: any[] = [session.tenantId]
    let paramIndex = 2

    if (invoiceId) {
      whereClause += ` AND invoice_id = $${paramIndex}`
      params.push(invoiceId)
      paramIndex++
    }

    const logs = await query<Record<string, any>>(
      `SELECT id, invoice_id, action, status, details, ip_address, user_agent, created_at
       FROM invoice_audit_log
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex}`,
      [...params, limit]
    )

    return NextResponse.json({
      success: true,
      logs: logs.map(log => ({
        ...log,
        details: log.details ? JSON.parse(log.details) : null,
        created_at: log.created_at,
      }))
    })
  } catch (error) {
    console.error('[Audit Log] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { invoice_id, action, status, details } = body

    if (!invoice_id || !action) {
      return NextResponse.json({ error: 'invoice_id and action required' }, { status: 400 })
    }

    const id = `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    await query(
      `INSERT INTO invoice_audit_log (id, tenant_id, invoice_id, action, status, details, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        id,
        session.tenantId,
        invoice_id,
        action,
        status || 'SUCCESS',
        details ? JSON.stringify(details) : null,
        request.headers.get('x-forwarded-for') || 'unknown',
        request.headers.get('user-agent') || 'unknown',
      ]
    )

    console.log(`[Audit] ${action} on ${invoice_id}: ${status}`)

    return NextResponse.json({ success: true, id })
  } catch (error) {
    console.error('[Audit Log] Error:', error)
    return NextResponse.json({ error: 'Failed to create audit log' }, { status: 500 })
  }
}