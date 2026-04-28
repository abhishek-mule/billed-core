import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/client'
import { generateId, hashPassword } from '@/lib/db/encryption'

interface ColumnRow {
  column_name: string
}

async function getTableColumns(tableName: string): Promise<Set<string>> {
  const rows = await query<ColumnRow>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  )

  return new Set(rows.map((row) => row.column_name))
}

function buildInsertStatement(
  tableName: string,
  values: Record<string, unknown>,
  conflictClause: string
) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined)
  const columns = entries.map(([column]) => column)
  const placeholders = entries.map((_, index) => `$${index + 1}`)

  return {
    sql: `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) ${conflictClause}`,
    params: entries.map(([, value]) => value),
  }
}

export async function POST(request: NextRequest) {
  const { testMode } = await request.json()
  
  if (!testMode || testMode !== 'enable-test-mode') {
    return NextResponse.json(
      { error: 'Not allowed. Provide testMode: "enable-test-mode"' },
      { status: 403 }
    )
  }

  try {
    const tenantId = `test_tenant_${Date.now()}`
    const userId = generateId('user')
    const uniqueDigits = `${Date.now()}`.slice(-8)
    const tenantPhone = `98${uniqueDigits}`
    const tenantEmail = `test-${tenantId}@billzo.local`
    const { hash: passwordHash, salt } = hashPassword('test123')
    const storedHash = JSON.stringify({ hash: passwordHash, salt })
    const tenantColumns = await getTableColumns('tenants')
    const tenantUserColumns = await getTableColumns('tenant_users')
    const credentialColumns = await getTableColumns('tenant_credentials')

    const tenantInsert = buildInsertStatement(
      'tenants',
      {
        id: tenantId,
        company_name: 'Test Shop',
        phone: tenantColumns.has('phone') ? tenantPhone : undefined,
        email: tenantColumns.has('email') ? tenantEmail : undefined,
        plan: 'free',
        is_active: true,
        timezone: tenantColumns.has('timezone') ? 'Asia/Kolkata' : undefined,
      },
      'ON CONFLICT (id) DO NOTHING'
    )

    await query(tenantInsert.sql, tenantInsert.params)

    const tenantUserInsert = buildInsertStatement(
      'tenant_users',
      {
        id: userId,
        tenant_id: tenantId,
        name: 'Test User',
        phone: tenantPhone,
        password_hash: storedHash,
        role: 'owner',
        is_active: true,
      },
      'ON CONFLICT DO NOTHING'
    )

    if (!tenantUserColumns.has('tenant_id') || !tenantUserColumns.has('phone')) {
      throw new Error('tenant_users table is missing required columns')
    }

    await query(tenantUserInsert.sql, tenantUserInsert.params)

    if (credentialColumns.size > 0) {
      const credentialInsert = buildInsertStatement(
        'tenant_credentials',
        {
          id: generateId('cred'),
          tenant_id: tenantId,
          erp_site_url: credentialColumns.has('erp_site_url') ? 'http://localhost' : undefined,
          erp_api_key_encrypted: 'test_key',
          erp_api_secret_encrypted: 'test_secret',
        },
        'ON CONFLICT DO NOTHING'
      )

      await query(credentialInsert.sql, credentialInsert.params)
    }

    return NextResponse.json({
      success: true,
      testTenant: {
        tenantId,
        userId,
        phone: tenantPhone,
        password: 'test123',
      },
      instructions: [
        'POST to /api/auth/login with phone and password',
        'Returns session cookie for authenticated API calls',
      ],
    })
  } catch (error) {
    console.error('[TestSetup] Error:', error)
    return NextResponse.json(
      { error: 'Setup failed', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
