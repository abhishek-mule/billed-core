import { NextRequest, NextResponse } from 'next/server'
import { verifyOTPHash, hashOTP, validatePhone, formatPhone } from '@/lib/billzo/auth-utils'
import { db } from '@/lib/billzo/db'
import crypto from 'crypto'
import { otpStore, sessionStore } from '@/lib/billzo/auth-store'

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000


export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, otp } = body

    if (!phone || !otp) {
      return NextResponse.json(
        { error: 'Phone and OTP are required' },
        { status: 400 }
      )
    }

    const validation = validatePhone(phone)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const formattedPhone = formatPhone(phone)
    const otpData = otpStore.get(formattedPhone)

    if (!otpData) {
      return NextResponse.json(
        { error: 'No OTP requested for this number' },
        { status: 400 }
      )
    }

    const age = Date.now() - otpData.createdAt
    if (age > 5 * 60 * 1000) {
      otpStore.delete(formattedPhone)
      return NextResponse.json(
        { error: 'OTP has expired. Please request a new one.' },
        { status: 400 }
      )
    }

    if (!verifyOTPHash(otpData.hash, otp, formattedPhone)) {
      return NextResponse.json(
        { error: 'Invalid OTP' },
        { status: 401 }
      )
    }

    otpStore.delete(formattedPhone)

    let userId: string
    const existingUser = await db().users?.where('phone').equals(formattedPhone).first()

    if (existingUser) {
      userId = existingUser.id
    } else {
      userId = `user_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
      await db().users?.add({
        id: userId,
        phone: formattedPhone,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }

    const sessionId = crypto.randomBytes(32).toString('hex')
    const accessToken = createAccessToken(sessionId, userId, formattedPhone)
    const refreshToken = createRefreshToken(sessionId, userId)

    sessionStore.set(sessionId, {
      userId,
      phone: formattedPhone,
      tenantId: null,
      isPaid: false,
      createdAt: Date.now(),
    })

    return NextResponse.json({
      success: true,
      accessToken,
      refreshToken,
      userId,
      phone: formattedPhone,
    })
  } catch (error) {
    console.error('OTP verify error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function createAccessToken(sessionId: string, userId: string, phone: string): string {
  const payload = {
    sessionId,
    userId,
    phone,
    type: 'access',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  }

  const secret = process.env.JWT_SECRET || 'development-secret-change-in-production'
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', secret)
    .update(base64Payload)
    .digest('base64url')

  return `${base64Payload}.${signature}`
}

function createRefreshToken(sessionId: string, userId: string): string {
  const payload = {
    sessionId,
    userId,
    type: 'refresh',
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_MS / 1000,
    iat: Math.floor(Date.now() / 1000),
  }

  const secret = process.env.JWT_SECRET || 'development-secret-change-in-production'
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', secret)
    .update(base64Payload)
    .digest('base64url')

  return `${base64Payload}.${signature}`
}
