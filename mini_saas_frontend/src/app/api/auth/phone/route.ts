import { NextRequest, NextResponse } from 'next/server'
import { generateOTP, hashOTP, normalizePhoneE164, validatePhone } from '@/lib/billzo/auth-utils'
import { setOtp } from '@/lib/billzo/auth-store'

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
    const isProviderConfigured = !!(apiKey && !apiKey.startsWith('<') && apiKey.length > 10)
    const e164 = normalizePhoneE164(phone)

    if (!isProviderConfigured) {
      const devOtp = process.env.DEV_OTP || generateOTP()
      const rateResult = await setOtp(e164, hashOTP(devOtp, e164))
      if (!rateResult.success) {
        return NextResponse.json({ error: rateResult.reason }, { status: 429 })
      }
      console.log(`[Phone/send] Dev OTP for ${e164}: ${devOtp}`)
      return NextResponse.json({
        success: true,
        message: `OTP generated for ${e164.slice(0, 5)}******${e164.slice(-4)}`,
        provider: 'local-dev',
      })
    }

    const otpToStore = generateOTP()
    const rateResult = await setOtp(e164, hashOTP(otpToStore, e164))
    if (!rateResult.success) {
      return NextResponse.json({ error: rateResult.reason }, { status: 429 })
    }

    const params = new URLSearchParams({
      authkey: apiKey,
      sender: senderId,
      mobile: e164.replace('+', ''),
      otp_length: '6',
    })
    if (templateId) {
      params.set('template_id', templateId)
    }

    const sendRes = await fetch(`https://api.msg91.com/api/sendotp.php?${params.toString()}`)
    const sendData = await sendRes.json()

    if (!sendRes.ok || sendData.type !== 'success') {
      console.error('[Phone/send] MSG91 send error:', JSON.stringify(sendData))
      console.log(`[Phone/send] Dev fallback OTP for ${e164}: ${otpToStore}`)
      return NextResponse.json({
        success: true,
        message: `OTP sent (fallback) for ${e164.slice(0, 5)}******${e164.slice(-4)}`,
        provider: 'local-fallback',
      })
    }

    return NextResponse.json({
      success: true,
      message: `OTP sent to ${e164.slice(0, 5)}******${e164.slice(-4)}`,
      provider: 'msg91',
    })
  } catch (error: any) {
    const msg = error?.message || String(error)
    console.error('[Phone/send] Error:', msg)
    if (msg.includes('Redis') || msg.includes('connect')) {
      return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Failed to send OTP' }, { status: 500 })
  }
}