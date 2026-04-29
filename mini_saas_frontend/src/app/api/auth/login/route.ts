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
  role: 'owner' | 'cashier' | 'accountant'
  is_active: boolean
  failed_login_attempts?: number
  locked_until?: string
}

const loginAttempts = new Map<string, { count: number; until: number }>()
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000

function checkRateLimit(phone: string): { blocked: boolean; remaining: number } {
  const attempts = loginAttempts.get(phone)
  if (!attempts) return { blocked: false, remaining: MAX_ATTEMPTS }
  
  if (attempts.until > Date.now()) {
    return { blocked: true, remaining: 0 }
  }
  
  return { blocked: false, remaining: MAX_ATTEMPTS - attempts.count }
}

function recordFailedAttempt(phone: string) {
  const current = loginAttempts.get(phone) || { count: 0, until: 0 }
  const newCount = current.count + 1
  
  if (newCount >= MAX_ATTEMPTS) {
    loginAttempts.set(phone, { count: newCount, until: Date.now() + LOCKOUT_MS })
  } else {
    loginAttempts.set(phone, { count: newCount, until: 0 })
  }
}

function clearFailedAttempts(phone: string) {
  loginAttempts.delete(phone)
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

    const rateLimit = checkRateLimit(phone)
    if (rateLimit.blocked) {
      return NextResponse.json(
        { error: 'Too many login attempts. Try again in 15 minutes.' },
        { status: 429 }
      )
    }

    const user = await queryOne<TenantUser>(
      'SELECT * FROM tenant_users WHERE phone = $1 AND is_active = true',
      [phone]
    )

    if (!user) {
      recordFailedAttempt(phone)
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
      recordFailedAttempt(phone)
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    clearFailedAttempts(phone)

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
      companyName: tenantRow.company_name,
      plan: 'free', // Defaulting to free, should ideally come from tenantRow
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

    await query(
      `INSERT INTO sessions (id, tenant_id, user_id, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')
       ON CONFLICT (id) DO UPDATE SET is_active = true, last_used_at = NOW()`,
      [session.id, user.tenant_id, user.id, request.headers.get('x-forwarded-for') || '127.0.0.1', request.headers.get('user-agent') || 'unknown']
    )

    return response
  } catch (error) {
    console.error('[Login] Error:', error)
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    )
  }
}