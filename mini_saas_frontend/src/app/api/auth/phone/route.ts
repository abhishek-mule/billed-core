import { NextRequest, NextResponse } from 'next/server'
import { validatePhone } from '@/lib/billzo/auth-utils'

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

    if (!apiKey || apiKey.startsWith('<')) {
      return NextResponse.json({ error: 'MSG91 not configured' }, { status: 500 })
    }

    const cleaned = phone.replace(/\D/g, '').slice(-10)
    const mobile = `91${cleaned}`
    const params = new URLSearchParams({
      authkey: apiKey,
      mobile,
      sender: senderId,
      message: 'Your verification code is ##OTP##',
    })

    const verifyRes = await fetch(`https://api.msg91.com/api/sendotp.php?${params}`)
    const data = await verifyRes.json()

    if (!verifyRes.ok || data.type !== 'success') {
      console.error('[Phone] MSG91 send error:', data)
      return NextResponse.json({ error: data.message || 'Failed to send OTP' }, { status: 500 })
    }

    const reqId = data.message || ''

    return NextResponse.json({
      success: true,
      message: `OTP sent to +91 ${cleaned.slice(0, 3)}******${cleaned.slice(-4)}`,
      reqId,
    })
  } catch (error) {
    console.error('[Phone] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
