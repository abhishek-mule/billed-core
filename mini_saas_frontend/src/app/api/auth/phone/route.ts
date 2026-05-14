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

    const formattedPhone = `91${phone.replace(/\D/g, '').slice(-10)}`
    console.log(`[Phone] OTP request for ${formattedPhone} — widget will handle OTP sending`)

    return NextResponse.json({
      success: true,
      message: `OTP will be sent to ${formattedPhone.slice(0, 3)}******${formattedPhone.slice(-4)}`,
    })
  } catch (error) {
    console.error('[Phone] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
