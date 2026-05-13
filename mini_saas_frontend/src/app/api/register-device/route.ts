import { NextRequest, NextResponse } from 'next/server'
import { saveDeviceToken, supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tenantId, fcmToken, deviceType } = body

    if (!tenantId || !fcmToken || !deviceType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Save to Supabase (Global DB)
    await saveDeviceToken(tenantId, fcmToken, deviceType)

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Register device error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { tenantId, fcmToken } = body

    if (!tenantId || !fcmToken) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Delete from Supabase
    const { error } = await supabaseAdmin
      .from('device_tokens')
      .delete()
      .match({ tenant_id: tenantId, fcm_token: fcmToken })

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Unregister device error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}