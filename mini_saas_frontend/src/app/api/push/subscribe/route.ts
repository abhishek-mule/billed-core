import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'
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

// POST - Subscribe to push notifications
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { subscription } = body

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription data required' }, { status: 400 })
    }

    // Check if subscription already exists
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM push_subscriptions WHERE tenant_id = $1 AND user_id = $2 AND endpoint = $3',
      [session.tenantId, session.userId, subscription.endpoint]
    )

    if (existing) {
      // Update existing subscription
      await query(
        `UPDATE push_subscriptions 
         SET keys_p256dh = $4, keys_auth = $5, updated_at = NOW() 
         WHERE id = $1`,
        [existing.id, subscription.keys.p256dh, subscription.keys.auth]
      )
    } else {
      // Create new subscription
      await query(
        `INSERT INTO push_subscriptions (tenant_id, user_id, endpoint, keys_p256dh, keys_auth, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [session.tenantId, session.userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
      )
    }

    return NextResponse.json({ success: true, message: 'Subscription saved successfully' })
  } catch (error: any) {
    console.error('[Push Subscribe] Error:', error)
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
  }
}

// DELETE - Unsubscribe from push notifications
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { endpoint } = body

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint required' }, { status: 400 })
    }

    await query(
      'DELETE FROM push_subscriptions WHERE tenant_id = $1 AND user_id = $2 AND endpoint = $3',
      [session.tenantId, session.userId, endpoint]
    )

    return NextResponse.json({ success: true, message: 'Unsubscribed successfully' })
  } catch (error: any) {
    console.error('[Push Unsubscribe] Error:', error)
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 })
  }
}