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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Phone] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
