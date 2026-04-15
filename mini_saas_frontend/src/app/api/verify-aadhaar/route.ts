import { NextResponse } from 'next/server'

const verificationStore = new Map<string, { aadhaar: string; expires: number }>()

export async function POST(request: Request) {
  try {
    const { aadhaarNumber } = await request.json()

    if (!aadhaarNumber || aadhaarNumber.replace(/\s/g, '').length !== 12) {
      return NextResponse.json(
        { success: false, message: 'Invalid Aadhaar number' },
        { status: 400 }
      )
    }

    const cleanAadhaar = aadhaarNumber.replace(/\s/g, '')
    
    const referenceId = `AADH_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    
    verificationStore.set(referenceId, {
      aadhaar: cleanAadhaar,
      expires: Date.now() + 10 * 60 * 1000,
    })

    console.log(`[MOCK Aadhaar] OTP sent for ${cleanAadhaar.slice(0, 4)}****${cleanAadhaar.slice(-4)}`)
    console.log(`[MOCK Aadhaar] Reference: ${referenceId}`)
    console.log(`[MOCK Aadhaar] Test OTP: Use 123456 for success, 000000 for failure`)

    return NextResponse.json({
      success: true,
      referenceId,
      message: 'OTP sent to registered mobile number',
      mock: true,
    })
  } catch (error) {
    console.error('Aadhaar verification error:', error)
    return NextResponse.json(
      { success: false, message: 'Verification failed' },
      { status: 500 }
    )
  }
}

export { verificationStore }
