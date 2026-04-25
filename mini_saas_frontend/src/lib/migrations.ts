import { query, queryOne } from '@/lib/db/client'

export interface SchemaMigration {
  id: string
  version: string
  description: string
  applied_at: Date
  rollback_sql: string | null
}

export async function getCurrentSchemaVersion(): Promise<string | null> {
  const result = await queryOne<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1'
  )
  return result?.version || null
}

export async function getMigrationHistory(): Promise<SchemaMigration[]> {
  return query<SchemaMigration>(
    'SELECT * FROM schema_migrations ORDER BY applied_at ASC'
  )
}

export async function applyMigration(
  migration: {
    id: string
    version: string
    description: string
    sql: string
    rollbackSql?: string
  },
  dryRun: boolean = false
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentSchemaVersion()
  
  if (current === migration.version) {
    return { success: true }
  }
  
  if (current && current > migration.version) {
    return { success: false, error: 'Cannot apply older migration' }
  }
  
  try {
    if (!dryRun) {
      await query('BEGIN')
      
      try {
        await query(migration.sql)
        
        await query(
          `INSERT INTO schema_migrations (id, version, description, rollback_sql)
           VALUES ($1, $2, $3, $4)`,
          [migration.id, migration.version, migration.description, migration.rollbackSql || null]
        )
        
        await query('COMMIT')
      } catch (error) {
        await query('ROLLBACK')
        throw error
      }
    }
    
    console.log(`[Migration] Applied ${migration.version}: ${migration.description}`)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function rollbackMigration(
  version: string
): Promise<{ success: boolean; error?: string }> {
  const migration = await queryOne<SchemaMigration>(
    'SELECT * FROM schema_migrations WHERE version = $1',
    [version]
  )
  
  if (!migration) {
    return { success: false, error: 'Migration not found' }
  }
  
  if (!migration.rollback_sql) {
    return { success: false, error: 'No rollback SQL defined' }
  }
  
  try {
    await query('BEGIN')
    
    try {
      await query(migration.rollback_sql)
      
      await query(
        'DELETE FROM schema_migrations WHERE version = $1',
        [version]
      )
      
      await query('COMMIT')
    } catch (error) {
      await query('ROLLBACK')
      throw error
    }
    
    console.log(`[Migration] Rolled back ${version}`)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export const MIGRATIONS = [
  {
    id: 'm001',
    version: '001',
    description: 'Initial schema with tenants, users, credentials',
    sql: `CREATE TABLE IF NOT EXISTS tenants (...); CREATE TABLE IF NOT EXISTS tenant_users (...);`,
  },
  {
    id: 'm002',
    version: '002',
    description: 'Add role_permissions table',
    sql: `CREATE TABLE IF NOT EXISTS role_permissions (...);`,
  },
  {
    id: 'm003',
    version: '003',
    description: 'Add audit_logs with IP/UA columns',
    sql: `CREATE TABLE IF NOT EXISTS audit_logs (...);`,
  },
  {
    id: 'm004',
    version: '004',
    description: 'Add invoices with ERPNext sync columns',
    sql: `CREATE TABLE IF NOT EXISTS invoices (...);`,
    rollbackSql: 'DROP TABLE IF EXISTS invoices;',
  },
  {
    id: 'm005',
    version: '005',
    description: 'Add invoice_notifications for multi-channel send tracking',
    sql: `CREATE TABLE IF NOT EXISTS invoice_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR NOT NULL,
      invoice_id VARCHAR NOT NULL,
      channel VARCHAR NOT NULL,
      provider VARCHAR,
      status VARCHAR NOT NULL,
      attempt INTEGER DEFAULT 1,
      provider_message_id VARCHAR,
      error_code VARCHAR,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      delivered_at TIMESTAMPTZ,
      UNIQUE (tenant_id, invoice_id, channel)
    );
    CREATE INDEX IF NOT EXISTS idx_invoice_notifications_tenant_created
      ON invoice_notifications(tenant_id, created_at DESC);`,
    rollbackSql: 'DROP TABLE IF EXISTS invoice_notifications;',
  },
] as const

export async function runMigrations(): Promise<void> {
  console.log('[Migration] Running migrations...')
  
  for (const migration of MIGRATIONS) {
    const result = await applyMigration(migration)
    
    if (!result.success) {
      console.error(`[Migration] Failed ${migration.version}: ${result.error}`)
      break
    }
  }
  
  const history = await getMigrationHistory()
  console.log(`[Migration] Applied ${history.length} migrations`)
}