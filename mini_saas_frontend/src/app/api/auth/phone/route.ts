import { NextRequest, NextResponse } from 'next/server'
import { validatePhone, generateOTP, hashOTP } from '@/lib/billzo/auth-utils'

const otpStore = new Map<string, { hash: string; createdAt: number }>()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone } = body

    const validation = validatePhone(phone)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const formattedPhone = `91${phone.replace(/\D/g, '').slice(-10)}`

    if (process.env.NODE_ENV === 'production') {
      const existingOTP = otpStore.get(formattedPhone)
      if (existingOTP) {
        const timeSinceLastOTP = Date.now() - existingOTP.createdAt
        if (timeSinceLastOTP < 60_000) {
          return NextResponse.json(
            { error: 'Please wait 60 seconds before requesting another OTP' },
            { status: 429 }
          )
        }
      }

      const otp = generateOTP()
      const hash = hashOTP(otp, formattedPhone)
      otpStore.set(formattedPhone, {
        hash,
        createdAt: Date.now(),
      })

      const smsResult = await sendOTPviaSMS(formattedPhone, otp)
      if (!smsResult.success) {
        console.error('Failed to send OTP:', smsResult.error)
        return NextResponse.json(
          { error: 'Failed to send OTP. Please try again.' },
          { status: 500 }
        )
      }
    } else {
      console.log(`[DEV] OTP for ${formattedPhone}: 123456`)
      const otp = '123456'
      const hash = hashOTP(otp, formattedPhone)
      otpStore.set(formattedPhone, {
        hash,
        createdAt: Date.now(),
      })
    }

    setTimeout(() => {
      otpStore.delete(formattedPhone)
    }, 5 * 60 * 1000)

    return NextResponse.json({
      success: true,
      message: `OTP sent to ${maskPhone(formattedPhone)}`,
    })
  } catch (error) {
    console.error('Phone auth error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}******${phone.slice(-4)}`
}

async function sendOTPviaSMS(phone: string, otp: string): Promise<{ success: boolean; error?: string }> {
  const provider = process.env.OTP_PROVIDER || 'msg91'

  if (provider === 'msg91') {
    return sendOTPviaMsg91(phone, otp)
  } else if (provider === 'twilio') {
    return sendOTPviaTwilio(phone, otp)
  }

  return { success: false, error: 'No OTP provider configured' }
}

async function sendOTPviaMsg91(phone: string, otp: string): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.MSG91_API_KEY
  const senderId = process.env.MSG91_SENDER_ID || 'BILLED'

  if (!apiKey) {
    return { success: false, error: 'MSG91 API key not configured' }
  }

  try {
    const response = await fetch(
      `https://api.msg91.com/api/v5/flow/send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authkey': apiKey,
        },
        body: JSON.stringify({
          flow_id: process.env.MSG91_FLOW_ID,
          sender: senderId,
          mobiles: phone,
          otp: otp,
        }),
      }
    )

    const data = await response.json()
    if (response.ok && data.type === 'success') {
      return { success: true }
    }

    return { success: false, error: data.message || 'Failed to send SMS' }
  } catch (error) {
    return { success: false, error: 'SMS service unavailable' }
  }
}

async function sendOTPviaTwilio(phone: string, otp: string): Promise<{ success: boolean; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_FROM_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: 'Twilio credentials not configured' }
  }

  try {
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SID}/Verifications`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          To: `+${phone}`,
          Channel: 'sms',
        }),
      }
    )

    if (response.ok) {
      return { success: true }
    }

    const data = await response.json()
    return { success: false, error: data.message || 'Failed to send OTP' }
  } catch (error) {
    return { success: false, error: 'SMS service unavailable' }
  }
}
