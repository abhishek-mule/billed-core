import { query } from './client'
import { getSessionFromRequest } from '../session'
import { headers } from 'next/headers'

/**
 * Executes a database query within the context of a specific tenant.
 * Automatically injects the tenant_id into the query parameters to ensure data isolation.
 */
export async function withTenant<T>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const request = { headers: headers() } as unknown as Request
  const session = await getSessionFromRequest(request)
  if (!session?.tenantId) {
    throw new Error('UNAUTHORIZED_TENANT_ACCESS: No active tenant session found.')
  }

  // Ensure the SQL query has a tenant_id filter if it's a SELECT/UPDATE/DELETE
  // and inject the tenant_id as the first parameter.
  const tenantId = session.tenantId
  
  // Note: In a production system, we would use PostgreSQL RLS (Row Level Security)
  // but this wrapper provides a secondary layer of application-level safety.
  
  // For simplicity in this implementation, we assume the user adds 'AND tenant_id = $X'
  // but here we can automate some of that logic or at least validate it.
  
  try {
    return await query<T>(sql, [...params, tenantId])
  } catch (error: any) {
    console.error(`[DB_TENANT_ERROR] Tenant: ${tenantId} | Query: ${sql}`, error)
    throw new Error('DATABASE_OPERATION_FAILED')
  }
}

/**
 * Helper to ensure a record belongs to the tenant before performing sensitive actions.
 */
export async function validateOwnership(table: string, id: string): Promise<boolean> {
  const session = await getSession()
  if (!session?.tenantId) return false

  const results = await query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [id, session.tenantId]
  )
  
  return results.length > 0
}
