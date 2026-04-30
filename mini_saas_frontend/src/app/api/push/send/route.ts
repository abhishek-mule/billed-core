import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query } from '@/lib/db/client'
import webpush from 'web-push'

// Configure VAPID
const publicVAPIDKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const privateVAPIDKey = process.env.VAPID_PRIVATE_KEY
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@billzo.com'

if (!publicVAPIDKey || !privateVAPIDKey) {
  console.warn('VAPID keys not configured. Push notifications will not work.')
} else {
  webpush.setVapidDetails(
    vapidSubject,
    publicVAPIDKey,
    privateVAPIDKey
  )
}

// POST - Send push notification
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title, body: notificationBody, icon, badge, data, userIds } = body

    if (!title) {
      return NextResponse.json({ error: 'Title required' }, { status: 400 })
    }

    // Get subscriptions to send to
    let subscriptions
    if (userIds && userIds.length > 0) {
      // Send to specific users
      subscriptions = await query(
        `SELECT endpoint, keys_p256dh, keys_auth 
         FROM push_subscriptions 
         WHERE tenant_id = $1 AND user_id = ANY($2)`,
        [session.tenantId, userIds]
      )
    } else {
      // Send to all users in tenant
      subscriptions = await query(
        `SELECT endpoint, keys_p256dh, keys_auth 
         FROM push_subscriptions 
         WHERE tenant_id = $1`,
        [session.tenantId]
      )
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No active subscriptions found',
        sent: 0
      })
    }

    // Prepare notification payload
    const payload = JSON.stringify({
      title,
      body: notificationBody || '',
      icon: icon || '/billZo_logo.png',
      badge: badge || '/logo-icon.svg',
      data: data || {},
      timestamp: Date.now()
    })

    // Send to all subscriptions
    const results = await Promise.allSettled(
      subscriptions.map(async (sub: any) => {
        try {
          const subscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys_p256dh,
              auth: sub.keys_auth
            }
          }

          await webpush.sendNotification(subscription, payload)
          return { success: true, endpoint: sub.endpoint }
        } catch (error: any) {
          console.error('Failed to send to', sub.endpoint, error)
          
          // Remove invalid subscriptions
          if (error.statusCode === 410 || error.code === 'ENOENT') {
            await query(
              'DELETE FROM push_subscriptions WHERE endpoint = $1',
              [sub.endpoint]
            )
          }
          
          return { success: false, endpoint: sub.endpoint, error: error.message }
        }
      })
    )

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length
    const failed = results.length - successful

    return NextResponse.json({
      success: true,
      message: `Sent ${successful} notifications, ${failed} failed`,
      sent: successful,
      failed,
      results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message })
    })
  } catch (error: any) {
    console.error('[Push Send] Error:', error)
    return NextResponse.json({ error: 'Failed to send notifications' }, { status: 500 })
  }
}