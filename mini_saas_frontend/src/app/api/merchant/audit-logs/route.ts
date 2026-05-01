import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { getAuditLogs, getAuditStats, exportAuditLogsToCSV } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * Get audit logs for the current tenant
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const entityType = searchParams.get('entityType') as any
    const action = searchParams.get('action') as any
    const userId = searchParams.get('userId') || undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined
    const exportFormat = searchParams.get('export')

    // Check if user has permission to view audit logs
    const { hasPermission } = require('@/lib/role-permissions')
    if (!hasPermission(session.role as any, 'viewAuditLogs')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Handle export requests
    if (exportFormat === 'csv') {
      const csv = await exportAuditLogsToCSV(session.tenantId, {
        entityType,
        action,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      })

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-logs-${Date.now()}.csv"`
        }
      })
    }

    // Get audit logs
    const logs = await getAuditLogs(session.tenantId, {
      limit,
      offset,
      entityType,
      action,
      userId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    })

    // Get statistics if requested
    const includeStats = searchParams.get('stats') === 'true'
    let stats = null
    if (includeStats) {
      stats = await getAuditStats(session.tenantId)
    }

    return NextResponse.json({
      success: true,
      logs,
      stats,
      pagination: {
        limit,
        offset,
        hasMore: logs.length === limit
      }
    })

  } catch (error: any) {
    console.error('[Audit Logs] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
  }
}