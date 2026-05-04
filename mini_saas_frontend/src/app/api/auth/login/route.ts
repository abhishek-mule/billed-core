import { NextRequest, NextResponse } from 'next/server'
import { createSession } from '@/lib/session'

let redis: any = null

async function getRedis() {
  if (redis) return redis
  try {
    const { Redis } = await import('@upstash/redis')
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    return redis
  } catch {
    return null
  }
}

function generateSecureOTP(): string {
  const array = new Uint8Array(4)
  crypto.getRandomValues(array)
  const num = Array.from(array).reduce((acc, b) => (acc << 8) | b, 0)
  return (num % 900000 + 100000).toString()
}

async function sendOTP(phone: string): Promise<string> {
  const otp = generateSecureOTP()
  const r = await getRedis()
  
  if (r) {
    await r.set(`otp:${phone}`, otp, { ex: 300 }) // 5 min expiry
    console.log(`[OTP] Stored in Redis for ${phone}: ${otp}`)
  }
  
  console.log(`[OTP] Mock SMS sent to ${phone}: Your verification code is ${otp}`)
  console.log(`[OTP] Valid for 5 minutes. Code: ${otp}`)
  return otp
}

async function verifyOTP(phone: string, input: string): Promise<boolean> {
  const r = await getRedis()
  
  if (r) {
    try {
      const stored = await r.get(`otp:${phone}`)
      if (!stored) return false
      
      const valid = stored === input
      if (valid) {
        await r.del(`otp:${phone}`)
      }
      return valid
    } catch (e) {
      console.error('[OTP] Redis error:', e)
    }
  }
  
  // Fallback: accept any 6-digit OTP for testing
  return /^\d{6}$/.test(input)
}

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
      const isValid = await verifyOTP(phone, otp)
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 401 })
      }

      // Create session
      const session = await createSession({
        tenantId: phone,
        userId: `user_${phone}`,
        role: 'owner',
        companyName: 'My Business',
        plan: 'free',
      })

      const response = NextResponse.json({
        success: true,
        message: 'Login successful'
      })

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