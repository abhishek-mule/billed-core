/**
 * Comprehensive Audit Trail Logging System
 * Tracks all critical actions for compliance and security
 */

import { query } from '@/lib/db/client'
import { getSessionFromRequest } from '@/lib/session'

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'view'
  | 'export'
  | 'login'
  | 'logout'
  | 'refund'
  | 'cancel'
  | 'sync'
  | 'reconcile'
  | 'send_reminder'
  | 'change_settings'
  | 'manage_users'

export type AuditEntityType =
  | 'invoice'
  | 'customer'
  | 'product'
  | 'payment'
  | 'purchase'
  | 'user'
  | 'settings'
  | 'report'
  | 'system'

export interface AuditLogEntry {
  id?: string
  tenantId: string
  userId: string
  role: string
  username: string
  action: AuditAction
  entityType: AuditEntityType
  entityId: string
  entityName?: string
  changes?: Record<string, any>
  ipAddress?: string
  userAgent?: string
  success: boolean
  durationMs?: number
  timestamp: Date
}

/**
 * Log an audit action
 */
export async function logAuditAction(entry: AuditLogEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (
        id, tenant_id, user_id, role, username, action, entity_type, entity_id,
        entity_name, changes, ip_address, user_agent, success, duration_ms, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()
      )`,
      [
        entry.tenantId,
        entry.userId,
        entry.role,
        entry.username,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.entityName || null,
        entry.changes ? JSON.stringify(entry.changes) : null,
        entry.ipAddress || null,
        entry.userAgent || null,
        entry.success,
        entry.durationMs || null
      ]
    )
  } catch (error) {
    console.error('[Audit Log] Failed to log action:', error)
    // Don't throw - audit logging shouldn't break the main flow
  }
}

/**
 * Log action from request context
 */
export async function logActionFromRequest(
  request: Request,
  action: AuditAction,
  entityType: AuditEntityType,
  entityId: string,
  entityName?: string,
  changes?: Record<string, any>,
  success: boolean = true,
  durationMs?: number
): Promise<void> {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return

    const ipAddress = getClientIP(request)
    const userAgent = request.headers.get('user-agent') || undefined

    await logAuditAction({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      username: session.userId, // You might want to fetch the actual username
      action,
      entityType,
      entityId,
      entityName,
      changes,
      ipAddress,
      userAgent,
      success,
      durationMs,
      timestamp: new Date()
    })
  } catch (error) {
    console.error('[Audit Log] Failed to log from request:', error)
  }
}

/**
 * Get audit logs for a tenant
 */
export async function getAuditLogs(
  tenantId: string,
  options: {
    limit?: number
    offset?: number
    entityType?: AuditEntityType
    userId?: string
    action?: AuditAction
    startDate?: Date
    endDate?: Date
  } = {}
): Promise<any[]> {
  try {
    const {
      limit = 50,
      offset = 0,
      entityType,
      userId,
      action,
      startDate,
      endDate
    } = options

    let whereClause = 'tenant_id = $1'
    const params: any[] = [tenantId]
    let paramIndex = 2

    if (entityType) {
      whereClause += ` AND entity_type = $${paramIndex}`
      params.push(entityType)
      paramIndex++
    }

    if (userId) {
      whereClause += ` AND user_id = $${paramIndex}`
      params.push(userId)
      paramIndex++
    }

    if (action) {
      whereClause += ` AND action = $${paramIndex}`
      params.push(action)
      paramIndex++
    }

    if (startDate) {
      whereClause += ` AND created_at >= $${paramIndex}`
      params.push(startDate)
      paramIndex++
    }

    if (endDate) {
      whereClause += ` AND created_at <= $${paramIndex}`
      params.push(endDate)
      paramIndex++
    }

    const logs = await query<any>(
      `SELECT * FROM audit_logs 
       WHERE ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    )

    return logs
  } catch (error) {
    console.error('[Audit Log] Failed to fetch logs:', error)
    return []
  }
}

/**
 * Get audit statistics for a tenant
 */
export async function getAuditStats(tenantId: string, days: number = 30): Promise<any> {
  try {
    const stats = await query<any>(
      `SELECT 
        COUNT(*) as total_actions,
        COUNT(*) FILTER (WHERE success = true) as successful_actions,
        COUNT(*) FILTER (WHERE success = false) as failed_actions,
        COUNT(DISTINCT user_id) as active_users,
        COUNT(DISTINCT entity_type) as entity_types,
        AVG(duration_ms) as avg_duration_ms
       FROM audit_logs 
       WHERE tenant_id = $1 
       AND created_at >= NOW() - INTERVAL '${days} days'`,
      [tenantId]
    )

    const actionBreakdown = await query<any>(
      `SELECT 
        action,
        entity_type,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE success = false) as failed_count
       FROM audit_logs 
       WHERE tenant_id = $1 
       AND created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY action, entity_type
       ORDER BY count DESC`,
      [tenantId]
    )

    const userActivity = await query<any>(
      `SELECT 
        user_id,
        username,
        role,
        COUNT(*) as action_count,
        MAX(created_at) as last_action
       FROM audit_logs 
       WHERE tenant_id = $1 
       AND created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY user_id, username, role
       ORDER BY action_count DESC
       LIMIT 10`,
      [tenantId]
    )

    return {
      summary: stats[0] || {},
      actionBreakdown,
      userActivity
    }
  } catch (error) {
    console.error('[Audit Log] Failed to fetch stats:', error)
    return {
      summary: {},
      actionBreakdown: [],
      userActivity: []
    }
  }
}

/**
 * Get client IP address from request
 */
function getClientIP(request: Request): string {
  // Try various headers for IP address
  const headers = [
    'x-forwarded-for',
    'x-real-ip',
    'cf-connecting-ip',
    'true-client-ip'
  ]

  for (const header of headers) {
    const ip = request.headers.get(header)
    if (ip) {
      // x-forwarded-for can contain multiple IPs, take the first one
      return ip.split(',')[0].trim()
    }
  }

  return 'unknown'
}

/**
 * Performance monitoring wrapper
 * Logs action with duration
 */
export function withAuditLogging<T extends any[], R>(
  action: AuditAction,
  entityType: AuditEntityType,
  handler: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const startTime = Date.now()
    let success = false
    let result: R
    let error: any

    try {
      result = await handler(...args)
      success = true
      return result
    } catch (err) {
      error = err
      throw err
    } finally {
      const duration = Date.now() - startTime
      
      // Try to get request context if available
      // This is a simplified version - in real implementation you'd pass request context
      try {
        // You would need to pass request context to make this work properly
        // For now, this is a placeholder for the pattern
        console.log(`[Audit] ${action} ${entityType} - ${success ? 'success' : 'failed'} (${duration}ms)`)
      } catch (logError) {
        // Ignore logging errors
      }
    }
  }
}

/**
 * Export audit logs to CSV
 */
export async function exportAuditLogsToCSV(
  tenantId: string,
  options: {
    startDate?: Date
    endDate?: Date
    entityType?: AuditEntityType
    action?: AuditAction
  } = {}
): Promise<string> {
  try {
    const logs = await getAuditLogs(tenantId, {
      ...options,
      limit: 10000 // Export limit
    })

    if (logs.length === 0) {
      return 'timestamp,user,role,action,entity_type,entity_id,entity_name,success,duration_ms\n'
    }

    const headers = ['timestamp', 'user', 'role', 'action', 'entity_type', 'entity_id', 'entity_name', 'success', 'duration_ms']
    const rows = logs.map((log: any) => [
      log.created_at,
      log.username,
      log.role,
      log.action,
      log.entity_type,
      log.entity_id,
      log.entity_name || '',
      log.success ? 'true' : 'false',
      log.duration_ms || ''
    ])

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    return csv
  } catch (error) {
    console.error('[Audit Log] Failed to export logs:', error)
    throw new Error('Failed to export audit logs')
  }
}