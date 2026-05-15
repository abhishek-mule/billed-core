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

    const mobile = phone.replace(/\D/g, '').slice(-10)
    const url = `https://api.msg91.com/api/sendotp.php?authkey=${apiKey}&sender=${senderId}&mobile=91${mobile}&message=Your%20verification%20code%20is%20%23%23OTP%23%23`

    const res = await fetch(url)
    const data = await res.json()

    if (!res.ok || data.type !== 'success') {
      console.error('[Phone/send] MSG91 error:', data)
      return NextResponse.json({ error: data.message || 'Failed to send OTP' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `OTP sent to +91 ${mobile.slice(0, 3)}******${mobile.slice(-4)}`,
    })
  } catch (error) {
    console.error('[Phone/send] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}