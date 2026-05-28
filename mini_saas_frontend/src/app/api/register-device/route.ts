import { NextRequest, NextResponse } from 'next/server'
import { saveDeviceToken, supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { fcmToken, deviceType } = body

    if (!fcmToken || !deviceType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    await saveDeviceToken(tenantId, fcmToken, deviceType)

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Register device error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { fcmToken } = body

    if (!fcmToken) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

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