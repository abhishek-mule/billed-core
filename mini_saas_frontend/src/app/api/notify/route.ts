import { NextRequest, NextResponse } from 'next/server'
import { deleteDeviceTokens, getDeviceTokens } from '@/lib/billzo/supabase-admin'
import { getFirebaseMessaging } from '@/lib/billzo/firebase-admin'

export const dynamic = 'force-dynamic'

/**
 * Sends a push notification to all devices of a tenant
 * In production, this requires a Firebase Service Account.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tenantId, title, body: message, icon, type, url } = body

    if (!tenantId || !title || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 1. Get tokens from Supabase
    const tokens = await getDeviceTokens(tenantId)
    
    if (tokens.length === 0) {
      return NextResponse.json({ success: true, message: 'No devices registered for this tenant' })
    }

    const messaging = getFirebaseMessaging()
    if (!messaging) {
      return NextResponse.json(
        {
          success: false,
          deliveredCount: 0,
          error: 'Firebase Admin is not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.',
        },
        { status: 500 },
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
    const clickUrl = url || '/dashboard'

    const result = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title,
        body: message,
        imageUrl: icon,
      },
      webpush: {
        fcmOptions: {
          link: new URL(clickUrl, appUrl).toString(),
        },
        notification: {
          title,
          body: message,
          icon: icon || '/logo_new.png',
          badge: '/logo-icon.svg',
          tag: type || 'billzo-alert',
          requireInteraction: type === 'daily_brief' || type === 'payment_due',
          data: {
            type: type || 'general',
            tenantId,
            url: clickUrl,
          },
          actions: [
            {
              action: 'open',
              title: 'Open BillZo',
            },
          ],
        },
      },
      data: {
        type: type || 'general',
        tenantId,
        url: clickUrl,
      },
    })

    const invalidTokens = result.responses
      .map((response, index) => ({ response, token: tokens[index] }))
      .filter(({ response }) => {
        const code = response.error?.code || ''
        return code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')
      })
      .map(({ token }) => token)

    await deleteDeviceTokens(invalidTokens)

    return NextResponse.json({ 
      success: true, 
      deliveredCount: result.successCount,
      failedCount: result.failureCount,
      cleanedInvalidTokens: invalidTokens.length,
    })

  } catch (error: any) {
    console.error('Notify error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
