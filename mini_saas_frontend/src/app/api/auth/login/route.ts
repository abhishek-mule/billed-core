import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db/client'
import { createSession } from '@/lib/session'
import { generateId } from '@/lib/db/encryption'

// Mock OTP verification service
// In production, integrate with a real provider (e.g., Twilio, Msg91)
async function sendOTP(phone: string): Promise<string> {
  // Generate random 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  // STORE OTP IN REDIS WITH EXPIRY
  console.log(`[OTP] Sending ${otp} to ${phone}`)
  return otp
}

export async function POST(request: NextRequest) {
  try {
    const { phone, otp } = await request.json()

    // Step 1: Send OTP request
    if (phone && !otp) {
      await sendOTP(phone)
      return NextResponse.json({ success: true, message: 'OTP sent' })
    }

    // Step 2: Verify OTP
    if (phone && otp) {
      // VALIDATE OTP FROM REDIS
      if (otp !== '123456') { // Mock verification
        return NextResponse.json({ error: 'Invalid OTP' }, { status: 401 })
      }

      // Check if tenant exists
      let user = await queryOne<{ id: string; tenant_id: string; role: string; name: string }>(
        'SELECT id, tenant_id, role, name FROM users WHERE phone = $1',
        [phone]
      )

      if (!user) {
        // AUTO-PROVISIONING: Create tenant & user
        const tenantId = `tenant_${generateId('')}`
        const userId = generateId('user')
        
        await query(
          `INSERT INTO tenants (id, company_name, phone, plan, is_active)
           VALUES ($1, $2, $3, 'free', true)`,
          [tenantId, 'New Business', phone]
        )
        
        await query(
          `INSERT INTO users (id, tenant_id, name, phone, role)
           VALUES ($1, $2, $3, $4, 'owner')`,
          [userId, tenantId, 'User', phone]
        )

        user = { id: userId, tenant_id: tenantId, role: 'owner', name: 'User' }
      }

      // Create Session
      const session = await createSession({
        tenantId: user.tenant_id,
        userId: user.id,
        role: user.role as any,
        companyName: 'New Business',
        plan: 'free',
      })

      const response = NextResponse.json({
        success: true,
        user: { id: user.id, name: user.name, phone },
        tenant: { id: user.tenant_id }
      })

      // Set session cookie
      const secure = process.env.NODE_ENV === 'production'
      response.cookies.set('billzo_session', session.id, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
      })

      return response
    }

    return NextResponse.json({ error: 'Missing phone or OTP' }, { status: 400 })
  } catch (error) {
    console.error('[Auth] Login failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
