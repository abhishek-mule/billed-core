import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { query, queryOne } from '@/lib/db/client'
import { hashPassword, verifyPassword } from '@/lib/db/encryption'
import { createSession, getSessionFromRequest } from '@/lib/session'

const SESSION_COOKIE = 'billzo_session'

interface TenantUser {
  id: string
  tenant_id: string
  name: string
  phone: string
  password_hash: string
  role: string
  is_active: boolean
}

export async function POST(request: NextRequest) {
  try {
    const { phone, password } = await request.json()

    if (!phone || !password) {
      return NextResponse.json(
        { error: 'Phone and password required' },
        { status: 400 }
      )
    }

    const user = await queryOne<TenantUser>(
      'SELECT * FROM tenant_users WHERE phone = $1 AND is_active = true',
      [phone]
    )

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    const valid = (() => {
      try {
        const stored = JSON.parse(user.password_hash)
        return verifyPassword(password, stored.hash, stored.salt)
      } catch {
        return verifyPassword(password, user.password_hash, '')
      }
    })()
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    const tenantRow = await queryOne<{ id: string; company_name: string }>(
      'SELECT id, company_name FROM tenants WHERE id = $1',
      [user.tenant_id]
    )

    if (!tenantRow) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 500 }
      )
    }

    await query(
      'UPDATE tenant_users SET last_login_at = NOW(), failed_login_attempts = 0 WHERE id = $1',
      [user.id]
    )

    const session = await createSession({
      tenantId: user.tenant_id,
      userId: user.id,
      role: user.role,
      ipAddress: request.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: request.headers.get('user-agent') || 'unknown',
    })

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
      tenant: {
        id: tenantRow.id,
        companyName: tenantRow.company_name,
      },
    })

    response.cookies.set(SESSION_COOKIE, session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 604800,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[Login] Error:', error)
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    )
  }
}