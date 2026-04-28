import { query } from '@/lib/db/client'
import { getRequestId } from '@/lib/correlation'

export interface AuditLogEntry {
  tenantId: string
  userId?: string
  action: string
  resourceType: 'INVOICE' | 'CUSTOMER' | 'SETTING' | 'AUTH' | 'SUBSCRIPTION'
  resourceId?: string
  originalValue?: any
  newValue?: any
  metadata?: any
}

/**
 * Persists an immutable audit log entry for critical actions.
 * Ensures accountability and trust in multi-tenant environments.
 */
export async function logAuditAction(entry: AuditLogEntry): Promise<void> {
  const requestId = await getRequestId()
  
  const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  
  try {
    await query(`
      INSERT INTO audit_logs (
        id, 
        tenant_id, 
        user_id, 
        request_id,
        action, 
        resource_type, 
        resource_id, 
        original_value, 
        new_value, 
        metadata,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    `, [
      id,
      entry.tenantId,
      entry.userId || 'system',
      requestId || 'unknown',
      entry.action,
      entry.resourceType,
      entry.resourceId || null,
      entry.originalValue ? JSON.stringify(entry.originalValue) : null,
      entry.newValue ? JSON.stringify(entry.newValue) : null,
      entry.metadata ? JSON.stringify(entry.metadata) : null
    ])
  } catch (error) {
    // We don't want audit logging failure to crash the main operation, 
    // but we MUST log it for infrastructure monitoring.
    console.error('[AuditLog] Failed to persist audit entry:', error, { entry, requestId })
  }
}
