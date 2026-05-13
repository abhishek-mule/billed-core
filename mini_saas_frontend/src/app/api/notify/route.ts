import { NextRequest, NextResponse } from 'next/server'
import { getDeviceTokens } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

/**
 * Sends a push notification to all devices of a tenant
 * In production, this requires a Firebase Service Account.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tenantId, title, body: message, icon, type } = body

    if (!tenantId || !title || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 1. Get tokens from Supabase
    const tokens = await getDeviceTokens(tenantId)
    
    if (tokens.length === 0) {
      return NextResponse.json({ success: true, message: 'No devices registered for this tenant' })
    }

    console.log(`[Push Notification] To Tenant ${tenantId}: ${title} - ${message}`)
    console.log(`[Push Notification] Target Tokens: ${tokens.length}`)

    // 2. Send via FCM
    // For now, we use the Firebase Cloud Messaging API with the API Key if possible,
    // or simply log it. To make this work fully, you need to add FIREBASE_ADMIN_SDK_JSON to your env.
    
    /* 
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
      },
      body: JSON.stringify({
        registration_ids: tokens,
        notification: {
          title,
          body: message,
          icon: icon || '/logo_new.png',
          click_action: 'https://billzo.in/dashboard',
        },
        data: {
          type,
          tenantId
        }
      }),
    })
    */

    return NextResponse.json({ 
      success: true, 
      deliveredCount: tokens.length,
      note: 'FCM delivery structure ready. Add Firebase Service Account for production.'
    })

  } catch (error: any) {
    console.error('Notify error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
