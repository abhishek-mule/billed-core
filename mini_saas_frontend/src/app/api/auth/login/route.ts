import { NextRequest, NextResponse } from 'next/server'
import { createSession } from '@/lib/session'

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: NextRequest) {
  try {
    const { phone, otp } = await request.json()

    if (!phone || !/^\d{10}$/.test(phone)) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }

    // Step 1: Send OTP (just log it for now)
    if (!otp) {
      const newOTP = generateOTP()
      console.log(`[OTP] Code for ${phone}: ${newOTP}`)
      return NextResponse.json({ 
        success: true, 
        message: 'OTP sent',
        // DEBUG: remove in production
        debugOTP: newOTP 
      })
    }

    // Step 2: Verify OTP - accept any 6-digit for testing
    if (otp && /^\d{6}$/.test(otp)) {
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

    return NextResponse.json({ error: 'Invalid OTP format' }, { status: 401 })
  } catch (error) {
    console.error('[Auth] Login failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}