import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyOTPHash, hashOTP, validatePhone, formatPhone } from '@/lib/billzo/auth-utils'
import { otpStore, sessionStore } from '@/lib/billzo/auth-store'
import {
  createAccessToken,
  createRefreshToken,
  setAuthCookies,
} from '@/lib/billzo/auth-jwt'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, otp } = body

    if (!phone || !otp) {
      return NextResponse.json({ error: 'Phone and OTP are required' }, { status: 400 })
    }

    const validation = validatePhone(phone)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const formattedPhone = formatPhone(phone)
    const otpData = otpStore.get(formattedPhone)

    if (!otpData) {
      return NextResponse.json({ error: 'No OTP requested for this number' }, { status: 400 })
    }

    const age = Date.now() - otpData.createdAt
    if (age > 5 * 60 * 1000) {
      otpStore.delete(formattedPhone)
      return NextResponse.json({ error: 'OTP has expired. Please request a new one.' }, { status: 400 })
    }

    if (!verifyOTPHash(otpData.hash, otp, formattedPhone)) {
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 401 })
    }

    otpStore.delete(formattedPhone)

    const userId = `user_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
    const sessionId = crypto.randomBytes(32).toString('hex')

    const existingSessions = Array.from(sessionStore.values()).filter((s) => s.userId === userId)
    const existingTenantId = existingSessions.length > 0 ? existingSessions[0].tenantId : undefined

    sessionStore.set(sessionId, {
      userId,
      phone: formattedPhone,
      tenantId: existingTenantId || null,
      isPaid: false,
      createdAt: Date.now(),
    })

    const accessToken = createAccessToken({ sessionId, userId, phone: formattedPhone, tenantId: existingTenantId ?? undefined })
    const refreshToken = createRefreshToken({ sessionId, userId })

    const response = NextResponse.json({
      success: true,
      accessToken,
      refreshToken,
      userId,
      phone: formattedPhone,
    })

    setAuthCookies(response, accessToken, refreshToken, existingTenantId ?? undefined)
    return response
  } catch (error) {
    console.error('OTP verify error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}