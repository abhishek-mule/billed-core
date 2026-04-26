import { NextResponse } from 'next/server'
import { verificationStore } from '@/lib/aadhaar/store'

const MOCK_DATA = {
  name: 'Rajesh Kumar Sharma',
  gender: 'M',
  dob: '15-08-1985',
  address: {
    careOf: 'S/O: Ramesh Sharma',
    houseNumber: '123',
    street: 'MG Road',
    location: 'Near Bus Stand',
    vtc: 'Pune City',
    district: 'Pune',
    state: 'Maharashtra',
    pincode: '411001',
  },
}

export async function POST(request: Request) {
  try {
    const { referenceId, otp } = await request.json()

    if (!referenceId || !otp) {
      return NextResponse.json(
        { success: false, message: 'Reference ID and OTP required' },
        { status: 400 }
      )
    }

    const verification = verificationStore.get(referenceId)

    if (!verification) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired reference ID' },
        { status: 400 }
      )
    }

    if (Date.now() > verification.expires) {
      verificationStore.delete(referenceId)
      return NextResponse.json(
        { success: false, message: 'OTP expired. Please request again.' },
        { status: 400 }
      )
    }

    if (otp.length !== 6) {
      return NextResponse.json(
        { success: false, message: 'OTP must be 6 digits' },
        { status: 400 }
      )
    }

    if (otp === '123456') {
      verificationStore.delete(referenceId)

      console.log(`[MOCK Aadhaar] Verified: ${verification.aadhaar.slice(0, 4)}****${verification.aadhaar.slice(-4)}`)

      return NextResponse.json({
        success: true,
        verified: true,
        message: 'Aadhaar verified successfully',
        data: {
          ...MOCK_DATA,
          maskedAadhaar: `${verification.aadhaar.slice(0, 4)} XXXX XXXX ${verification.aadhaar.slice(-4)}`,
        },
      })
    }

    if (otp === '000000') {
      return NextResponse.json({
        success: true,
        verified: false,
        message: 'OTP verification failed. Please try again.',
      })
    }

    return NextResponse.json({
      success: true,
      verified: false,
      message: 'Invalid OTP. Please try again.',
    })
  } catch (error) {
    console.error('Aadhaar OTP verification error:', error)
    return NextResponse.json(
      { success: false, message: 'Verification failed' },
      { status: 500 }
    )
  }
}
