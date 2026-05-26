import { getMessaging } from 'firebase-admin/messaging'
import { getFirebaseAdminApp } from './firebase-admin'
import { getDeviceTokens, deleteDeviceTokens } from './supabase-admin'

export async function sendPushNotification(params: {
  tenantId: string
  title: string
  body: string
  type?: string
  url?: string
}): Promise<{ deliveredCount: number; failedCount: number }> {
  const { tenantId, title, body, type, url } = params

  const tokens = await getDeviceTokens(tenantId)
  if (tokens.length === 0) {
    console.log(`[Notifications] No devices registered for tenant ${tenantId}`)
    return { deliveredCount: 0, failedCount: 0 }
  }

  const app = getFirebaseAdminApp()
  if (!app) {
    console.log('[Notifications] Firebase Admin not configured, skipping push')
    return { deliveredCount: 0, failedCount: 0 }
  }

  const messaging = getMessaging(app)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://billzo.in'

  const result = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: {
      fcmOptions: { link: new URL(url || '/dashboard', appUrl).toString() },
      notification: {
        title,
        body,
        icon: '/logo_new.png',
        badge: '/logo-icon.svg',
        tag: type || 'billzo-alert',
        requireInteraction: true,
        data: { type: type || 'general', tenantId, url: url || '/dashboard' },
        actions: [{ action: 'open', title: 'Open BillZo' }],
      },
    },
    data: { type: type || 'general', tenantId, url: url || '/dashboard' },
  })

  const invalidTokens = result.responses
    .map((r, i) => ({ response: r, token: tokens[i] }))
    .filter(({ response }) => {
      const code = response.error?.code || ''
      return code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')
    })
    .map(({ token }) => token)

  if (invalidTokens.length > 0) {
    await deleteDeviceTokens(invalidTokens)
  }

  return { deliveredCount: result.successCount, failedCount: result.failureCount }
}
