import { NextRequest, NextResponse } from 'next/server'
import { generateOTP, hashOTP, normalizePhone, validatePhone } from '@/lib/billzo/auth-utils'
import { otpStore } from '@/lib/billzo/auth-store'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone } = body

    const validation = validatePhone(phone)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const apiKey = process.env.MSG91_API_KEY
    const senderId = process.env.MSG91_SENDER_ID || 'BILLZOT'
    const templateId = process.env.MSG91_TEMPLATE_ID
    const isProviderConfigured = !!(apiKey && !apiKey.startsWith('<'))
    const { e164, local } = normalizePhone(phone)

    if (!isProviderConfigured) {
      const devOtp = process.env.DEV_OTP || generateOTP()
      otpStore.set(e164, {
        hash: hashOTP(devOtp, e164),
        createdAt: Date.now(),
      })

      return NextResponse.json({
        success: true,
        message: `OTP generated for +91 ${local.slice(0, 3)}******${local.slice(-4)}`,
        ...(process.env.NODE_ENV !== 'production' ? { otp: devOtp, provider: 'local-dev' } : {}),
      })
    }

    const params = new URLSearchParams({
      authkey: apiKey,
      sender: senderId,
      mobile: e164,
      message: 'Your verification code is ##OTP##',
      otp_length: '6',
    })

    if (templateId) {
      params.set('template_id', templateId)
    }

    const url = `https://api.msg91.com/api/sendotp.php?${params.toString()}`

    const res = await fetch(url)
    const data = await res.json()

    if (!res.ok || data.type !== 'success') {
      console.error('[Phone/send] MSG91 error:', data)
      return NextResponse.json({ error: data.message || 'Failed to send OTP' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `OTP sent to +91 ${local.slice(0, 3)}******${local.slice(-4)}`,
      provider: 'msg91',
    })
  } catch (error) {
    console.error('[Phone/send] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
