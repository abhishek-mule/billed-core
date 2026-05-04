import { NextRequest, NextResponse } from 'next/server'
import { createSession } from '@/lib/session'

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
  const otp = generateSecureOTP()
  otpStore.set(phone, { otp, expires: Date.now() + OTP_EXPIRY_MS })
  console.log(`[OTP] Mock SMS sent to ${phone}: Your verification code is ${otp}`)
  console.log(`[OTP] Valid for 5 minutes. Code: ${otp}`)
  return otp
}

function verifyOTP(phone: string, input: string): boolean {
  const stored = otpStore.get(phone)
  if (!stored) return false
  if (Date.now() > stored.expires) {
    otpStore.delete(phone)
    return false
  }
  const valid = stored.otp === input
  if (valid) otpStore.delete(phone)
  return valid
}

// Cleanup expired OTPs
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

      // Create session without DB (for now)
      const session = await createSession({
        tenantId: phone, // Use phone as temp tenant ID
        userId: `user_${phone}`,
        role: 'owner',
        companyName: 'My Business',
        plan: 'free',
      })
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
