import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db/client'
import { createSession } from '@/lib/session'
import { generateId } from '@/lib/db/encryption'

// OTP Storage (In production, use Redis with TTL)
// Format: { phone: { otp: string, expires: number } }
const otpStore = new Map<string, { otp: string; expires: number }>()
const OTP_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes

function generateSecureOTP(): string {
  const array = new Uint8Array(4)
  crypto.getRandomValues(array)
  const num = Array.from(array).reduce((acc, b) => (acc << 8) | b, 0)
  return (num % 900000 + 100000).toString()
}

async function sendOTP(phone: string): Promise<string> {
  if (process.env.OTP_MOCK !== 'false') {
    const otp = generateSecureOTP()
    otpStore.set(phone, { otp, expires: Date.now() + OTP_EXPIRY_MS })
    console.log(`[OTP] Mock SMS sent to ${phone}: Your verification code is ${otp}`)
    console.log(`[OTP] Valid for 5 minutes. Code: ${otp}`)
    return otp
  }

  // TODO: Integrate with Twilio/Msg91 in production
  throw new Error('SMS provider not configured. Set OTP_MOCK=false and configure provider.')
}

function verifyOTP(phone: string, input: string): boolean {
  const stored = otpStore.get(phone)
  if (!stored) return false
  if (Date.now() > stored.expires) {
    otpStore.delete(phone)
    return false
  }
  const valid = stored.otp === input
  if (valid) otpStore.delete(phone) // One-time use
  return valid
}

// Cleanup expired OTPs periodically
setInterval(() => {
  const now = Date.now()
  for (const [phone, data] of otpStore.entries()) {
    if (now > data.expires) otpStore.delete(phone)
  }
}, 60000)

export async function POST(request: NextRequest) {
  try {
    const { phone, otp } = await request.json()

    if (!phone || !/^\d{10}$/.test(phone)) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }

    // Step 1: Send OTP
    if (!otp) {
      await sendOTP(phone)
      return NextResponse.json({ success: true, message: 'OTP sent' })
    }

    // Step 2: Verify OTP
    if (otp) {
      if (!verifyOTP(phone, otp)) {
        return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 401 })
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
