import { Pool, PoolClient } from 'pg'

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  }
  return pool
}

let currentTenantId: string | null = null

export function setTenantContext(tenantId: string) {
  currentTenantId = tenantId
}

export function getTenantContext(): string | null {
  return currentTenantId
}

export async function query<T>(text: string, params?: any[]): Promise<T[]> {
  const client = await getPool().connect()
  try {
    if (currentTenantId) {
      await client.query(`SET app.current_tenant_id = $1`, [currentTenantId])
    }
    const result = await client.query(text, params)
    return result.rows as T[]
  } finally {
    client.release()
  }
}

export async function queryOne<T>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] || null
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    if (currentTenantId) {
      await client.query(`SET app.current_tenant_id = $1`, [currentTenantId])
    }
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export interface Tenant {
  id: string
  company_name: string
  subdomain: string | null
  plan: string
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export interface TenantUser {
  id: string
  tenant_id: string
  name: string
  email: string | null
  phone: string
  password_hash: string | null
  role: string
  is_active: boolean
  last_login_at: Date | null
  failed_login_attempts: number
  locked_until: Date | null
  created_at: Date
  updated_at: Date
}

export interface TenantCredential {
  id: string
  tenant_id: string
  erp_site_url: string | null
  erp_api_key_encrypted: string
  erp_api_secret_encrypted: string
  key_version: string
  created_at: Date
  updated_at: Date
}

export interface RolePermission {
  id: string
  role: string
  permission: string
}

export interface AuditLog {
  id: string
  tenant_id: string
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  metadata: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: Date
}

export async function getTenantById(id: string): Promise<Tenant | null> {
  return queryOne<Tenant>('SELECT * FROM tenants WHERE id = $1', [id])
}

export async function getTenantUserByPhone(tenantId: string, phone: string): Promise<TenantUser | null> {
  return queryOne<TenantUser>(
    'SELECT * FROM tenant_users WHERE tenant_id = $1 AND phone = $2',
    [tenantId, phone]
  )
}

export async function getTenantCredential(tenantId: string): Promise<TenantCredential | null> {
  return queryOne<TenantCredential>(
    'SELECT * FROM tenant_credentials WHERE tenant_id = $1',
    [tenantId]
  )
}

export async function getRolePermissions(role: string): Promise<string[]> {
  const rows = await query<RolePermission>(
    'SELECT permission FROM role_permissions WHERE role = $1',
    [role]
  )
  return rows.map(r => r.permission)
}

export async function hasPermission(role: string, permission: string): Promise<boolean> {
  const row = await queryOne<RolePermission>(
    'SELECT 1 FROM role_permissions WHERE role = $1 AND permission = $2',
    [role, permission]
  )
  return !!row
}

export async function updateLastLogin(userId: string): Promise<void> {
  await query(
    'UPDATE tenant_users SET last_login_at = NOW(), failed_login_attempts = 0 WHERE id = $1',
    [userId]
  )
}

export async function incrementFailedLogin(userId: string): Promise<number> {
  const result = await query<TenantUser>(
    `UPDATE tenant_users 
     SET failed_login_attempts = failed_login_attempts + 1,
         locked_until = CASE WHEN failed_login_attempts >= 4 THEN NOW() + interval '30 minutes' 
         ELSE NULL END
     WHERE id = $1
     RETURNING failed_login_attempts`,
    [userId]
  )
  return result[0]?.failed_login_attempts || 0
}

export async function unlockUser(userId: string): Promise<void> {
  await query(
    'UPDATE tenant_users SET locked_until = NULL, failed_login_attempts = 0 WHERE id = $1',
    [userId]
  )
}

export async function createAuditLog(data: {
  tenant_id: string
  user_id?: string
  action: string
  entity_type?: string
  entity_id?: string
  metadata?: Record<string, unknown>
  ip_address?: string
  user_agent?: string
}): Promise<void> {
  const { Redis } = await import('@upstash/redis')
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
  
  const id = `log_${Date.now()}_${Math.random().toString(36).slice(2)}`
  
  await redis.set(`audit:${id}`, JSON.stringify({
    ...data,
    id,
    created_at: new Date().toISOString(),
  }))
  
  await redis.lpush(`audit_queue:${data.tenant_id}`, id)
  await redis.ltrim(`audit_queue:${data.tenant_id}`, 0, 999)
}