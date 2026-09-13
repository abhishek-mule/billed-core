import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { buildNotification } from '@billzo/shared'
import { verifyRequest, errorResponse } from '@/lib/billzo/api-middleware'
import { createRedisClient } from '@/lib/billzo/redis'
import { deleteDeviceTokens, getDeviceTokens, supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getFirebaseMessaging } from '@/lib/billzo/firebase-admin'

export const dynamic = 'force-dynamic'

/**
 * "Send test notification" — exercises the EXACT production chain:
 *
 *   buildNotification (shared contract, system category — never pref-gated)
 *   → notification record (source of truth)
 *   → SSE fan-out (in-app center/badge)
 *   → best-effort FCM delivery (delivery only, never the source of truth)
 *
 * No data mutation beyond a single dedupe-keyed test record per tenant tap.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId!
    const userId = auth.userId!

    const record = buildNotification({
      type: 'notification.test',
      data: {
        title: 'Test notification',
        body: 'This is a test — if you can see this, notifications are working.',
        targetId: tenantId,
      },
      tenantId,
      recipientUserId: userId,
      dedupeKey: `notification.test:${tenantId}:${crypto.randomUUID()}`,
    })

    // 1. RECORD FIRST.
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('notifications')
      .insert({
        tenant_id: record.tenantId,
        recipient_user_id: record.recipientUserId,
        type: record.type,
        level: record.level,
        title: record.title,
        body: record.body,
        target_type: record.targetType,
        target_id: record.targetId,
        action: record.action,
        dedupe_key: record.dedupeKey,
        is_read: false,
      })
      .select('id')
      .maybeSingle()

    if (insertError) {
      console.error('[Notifications] Test record failed to persist:', insertError.message)
      throw insertError
    }

    // 2. SSE fan-out (best-effort).
    try {
      await createRedisClient().publish(
        `events:${tenantId}`,
        JSON.stringify({
          type: 'notification.created',
          data: {
            id: inserted?.id,
            type: record.type,
            level: record.level,
            title: record.title,
            body: record.body,
            targetType: record.targetType,
            targetId: record.targetId,
            action: record.action,
            createdAt: new Date().toISOString(),
          },
          timestamp: Date.now(),
        }),
      )
    } catch {
      // non-critical
    }

    // 3. FCM delivery is best-effort and never un-creates the record.
    const tokens = await getDeviceTokens(tenantId)
    if (tokens.length === 0) {
      return NextResponse.json({
        success: true,
        id: inserted?.id,
        deliveredCount: 0,
        simulated: false,
        message: 'Notification added to the center. No device registered for push yet — tap "Enable Notifications".',
      })
    }

    const messaging = getFirebaseMessaging()
    if (!messaging) {
      return NextResponse.json({
        success: true,
        id: inserted?.id,
        deliveredCount: 0,
        simulated: true,
        message: 'Notification added to the center. Firebase Admin not configured (FIREBASE_SERVICE_ACCOUNT_JSON) — push simulated.',
      })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
    const clickUrl = '/notifications'

    const result = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: record.title, body: record.body },
      webpush: {
        fcmOptions: { link: new URL(clickUrl, appUrl).toString() },
        notification: {
          title: record.title,
          body: record.body,
          icon: '/logo.svg',
          badge: '/logo.svg',
          tag: 'notification-test',
          data: { type: record.type, tenantId, url: clickUrl },
          actions: [{ action: 'open', title: 'View Notifications' }],
        },
      },
      data: { type: record.type, tenantId, url: clickUrl },
    })

    const invalidTokens = result.responses
      .map((response, index) => ({ response, token: tokens[index] }))
      .filter(({ response }) => {
        const code = response.error?.code || ''
        return code.includes('registration-token-not-registered') || code.includes('invalid-registration-token') || code.includes('invalid-argument')
      })
      .map(({ token }) => token)

    await deleteDeviceTokens(invalidTokens)

    return NextResponse.json({
      success: true,
      id: inserted?.id,
      deliveredCount: result.successCount,
      failedCount: result.failureCount,
      simulated: false,
      cleanedInvalidTokens: invalidTokens.length,
    })
  } catch (error) {
    console.error('[Notifications] Test push failed:', error instanceof Error ? error.message : String(error))
    return errorResponse(error instanceof Error ? error : new Error('Failed to send test notification'), 500)
  }
}