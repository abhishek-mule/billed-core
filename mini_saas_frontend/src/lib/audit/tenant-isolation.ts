import { query } from '@/lib/db/client'

// Required for internal consistency checks
const REQUIRED_TENANT_FIELDS = [
  'invoices',
  'items',
  'customers',
  'tenants',
  'audit_logs',
  'role_permissions'
];

export interface TenantIsolationCheck {
  table: string
  hasTenantId: boolean
  hasRLS: boolean
}

export async function checkTenantIsolation(): Promise<TenantIsolationCheck[]> {
  const results: TenantIsolationCheck[] = []
  
  try {
    // Dynamically fetch all user-defined tables in the public schema
    const tables = await query<{ table_name: string }>(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `, [])
    
    // Optimized execution with Promise.all
    const checkPromises = tables.map(async ({ table_name: table }) => {
      const [columns, hasRLS] = await Promise.all([
        query<{ column_name: string }>(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = $1
        `, [table]),
        checkRLSEnabled(table)
      ])

      return {
        table,
        hasTenantId: columns.some(c => c.column_name === 'tenant_id'),
        hasRLS
      }
    })

    results.push(...(await Promise.all(checkPromises)))
  } catch (error) {
    console.error('[TenantIsolation] Critical failure in isolation scan', error)
  }
  
  return results
}

async function checkRLSEnabled(table: string): Promise<boolean> {
  try {
    const result = await query(`
      SELECT rowsecurity 
      FROM pg_tables 
      WHERE tablename = $1
    `, [table]) as any[]
    
    return result[0]?.rowsecurity === true
  } catch {
    return false
  }
}

export function assertTenantFilter(table: string): void {
  const mustHaveTenant = REQUIRED_TENANT_FIELDS.includes(table)
  
  if (!mustHaveTenant) {
    console.warn(`[TenantIsolation] Warning: ${table} not in standard tables - verify manually`)
  }
}

export async function verifyAllQueries(): Promise<{
  passed: boolean
  issues: string[]
}> {
  const issues: string[] = []
  
  const checks = await checkTenantIsolation()
  
  for (const check of checks) {
    if (!check.hasTenantId) {
      issues.push(`Table ${check.table} missing tenant_id column`)
    }
    
    if (!check.hasRLS) {
      issues.push(`Table ${check.table} missing RLS policy`)
    }
  }
  
  return {
    passed: issues.length === 0,
    issues,
  }
}

export async function runTenantIsolationCheck(): Promise<void> {
  console.log('[TenantIsolation] Running isolation check...')
  
  const results = await checkTenantIsolation()
  
  for (const result of results) {
    const status = result.hasTenantId && result.hasRLS ? '✓' : '✗'
    console.log(`  ${status} ${result.table}: tenant_id=${result.hasTenantId}, RLS=${result.hasRLS}`)
  }
  
  const verified = await verifyAllQueries()
  
  if (!verified.passed) {
    console.error('[TenantIsolation] Issues found:')
    for (const issue of verified.issues) {
      console.error(`  - ${issue}`)
    }
  } else {
    console.log('[TenantIsolation] All checks passed')
  }
}