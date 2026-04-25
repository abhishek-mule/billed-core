import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db/client'
import { generateId, hashPassword } from '@/lib/db/encryption'

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
    const userId = generateId()
    const { hash: passwordHash, salt } = hashPassword('test123')
    const storedHash = JSON.stringify({ hash: passwordHash, salt })

    await query(
      `INSERT INTO tenants (id, company_name, plan, is_active, timezone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [tenantId, 'Test Shop', 'free', true, 'Asia/Kolkata']
    )

    await query(
      `INSERT INTO tenant_users (id, tenant_id, name, phone, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, phone) DO NOTHING`,
      [userId, tenantId, 'Test User', '+919999999999', storedHash, 'owner', true]
    )

    await query(
      `INSERT INTO tenant_credentials (id, tenant_id, erp_api_key_encrypted, erp_api_secret_encrypted)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [generateId(), tenantId, 'test_key', 'test_secret']
    )

    return NextResponse.json({
      success: true,
      testTenant: {
        tenantId,
        userId,
        phone: '+919999999999',
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
      { error: 'Setup failed' },
      { status: 500 }
    )
  }
}