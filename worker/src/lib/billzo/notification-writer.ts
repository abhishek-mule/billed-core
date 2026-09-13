// ============================================================
// NOTIFICATION WRITER — record-first, push-second (spec §11/§13)
// ============================================================
// The `notifications` table (migration 095) is the source of truth for the
// in-app center. Push (FCM) is best-effort delivery and can NEVER delete or
// roll back a record. Idempotency is enforced at the DB by
// UNIQUE(tenant_id, dedupe_key): re-processing the same source event is a
// silent no-op, so exactly-once never depends on queue timing or retries.
//
// Call sites emit notification SIGNALS, never raw rows. buildNotification()
// (shared contract) derives copy, level, target, and the default dedupe key —
// but signals override with an EVENT-keyed key so a replayed event can never
// produce a duplicate record, regardless of which lane handled it.

import {
  buildNotification,
  dedupeKeyForEvent,
  defaultNotificationPreferences,
  notificationDeepLinkAbsolute,
  shouldNotify,
  type NewNotification,
  type NotificationData,
  type NotificationPreferences,
  type NotificationType,
} from '@billzo/shared'
import { supabaseAdmin } from './supabase-admin'
import { getRedis } from '../../../lib/redis'
import { sendPushNotification } from './notifications'

const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'

export interface NotificationSignal<T extends NotificationType> {
  tenantId: string
  type: T
  data: NotificationData[T]
  /** Source domain event id → deterministic event-keyed dedupe key. */
  eventId: string
  recipientUserId?: string | null
}

// No preferences row => defaults (recovery/payments push on, back-in-stock off).
async function loadPreferences(tenantId: string): Promise<NotificationPreferences> {
  const { data, error } = await supabaseAdmin
    .from('notification_preferences')
    .select('push_enabled, recovery, payments, inventory, back_in_stock, updated_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error || !data) return defaultNotificationPreferences()

  return {
    pushEnabled: data.push_enabled ?? true,
    recovery: data.recovery ?? true,
    payments: data.payments ?? true,
    inventory: data.inventory ?? true,
    backInStock: data.back_in_stock ?? false,
    updatedAt: data.updated_at ?? null,
  }
}

export async function emitNotification<T extends NotificationType>(
  signal: NotificationSignal<T>,
): Promise<{ created: boolean }> {
  const { tenantId, type, data, eventId, recipientUserId } = signal

  // 1. Preference gate — opted-out categories are not projected at all.
  const prefs = await loadPreferences(tenantId)
  if (!shouldNotify(prefs, type)) {
    console.log(`[Notifications] Suppressed by preference: ${type} (tenant ${tenantId})`)
    return { created: false }
  }

  // 2. Build record from the shared contract (copy/level/target/dedupe).
  const record: NewNotification = buildNotification({
    type,
    data,
    tenantId,
    recipientUserId: recipientUserId ?? null,
    dedupeKey: dedupeKeyForEvent(type, eventId),
  })

  // 3. RECORD FIRST — the center is the source of truth.
  const { data: inserted, error } = await supabaseAdmin
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

  if (error) {
    // 23505 = UNIQUE(tenant_id, dedupe_key) — already projected (idempotent).
    if ((error as { code?: string }).code === '23505') return { created: false }
    console.error(`[Notifications] Failed to persist ${record.type}:`, error.message)
    return { created: false }
  }

  // 4. PUSH IS BEST-EFFORT DELIVERY — failure never un-creates the record.
  if (prefs.pushEnabled) {
    await sendPushNotification({
      tenantId,
      title: record.title,
      body: record.body,
      type: record.type,
      url: notificationDeepLinkAbsolute(
        { targetType: record.targetType, targetId: record.targetId },
        appUrl,
      ),
    }).catch((err: any) => {
      console.error(`[Notifications] Push delivery failed (record kept): ${record.type}`, err?.message)
    })
  }

  // 5. SSE fan-out is best-effort, NOT the source of truth (in-app center reads DB).
  try {
    const pub = getRedis()
    await pub.publish(
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

  return { created: true }
}