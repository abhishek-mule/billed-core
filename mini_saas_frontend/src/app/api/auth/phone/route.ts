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
    const apiKey = process.env.MSG91_API_KEY
    const flowId = process.env.MSG91_FLOW_ID

    if (!apiKey || apiKey.startsWith('<') || !flowId || flowId.startsWith('<')) {
      return NextResponse.json({ error: 'MSG91 not configured' }, { status: 500 })
    }

    const verifyRes = await fetch('https://verify.msg91.com/api/v5/otp/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authkey': apiKey,
      },
      body: JSON.stringify({
        widget_id: process.env.MSG91_WIDGET_ID,
        country_code: '91',
        mobile: phone.replace(/\D/g, '').slice(-10),
      }),
    })

    const data = await verifyRes.json()
    if (!verifyRes.ok) {
      console.error('[Phone] MSG91 error:', data)
      return NextResponse.json({ error: data.message || 'Failed to send OTP' }, { status: 500 })
    }

    const reqId = data.data?.request_ids?.[0] || data.request_id || data.reqId || ''

    console.log(`[Phone] OTP sent to ${formattedPhone}, reqId: ${reqId}`)

    return NextResponse.json({
      success: true,
      message: `OTP sent to +91 ${phone.slice(-4)}`,
      reqId,
    })
  } catch (error) {
    console.error('[Phone] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
