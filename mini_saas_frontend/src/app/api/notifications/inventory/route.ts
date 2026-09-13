import { NextRequest, NextResponse } from 'next/server'
import {
  buildNotification,
  defaultNotificationPreferences,
  shouldNotify,
  type NotificationData,
  type NotificationPreferences,
} from '@billzo/shared'
import { verifyRequest, validateJsonBody, errorResponse } from '@/lib/billzo/api-middleware'
import { createRedisClient } from '@/lib/billzo/redis'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import {
  computeInventoryAlert,
  getStockStatus,
  type InventoryAlertType,
  type ProductAlertCycleState,
  type ProductAlertState,
} from '@/lib/billzo/inventory-alerting'

export const dynamic = 'force-dynamic'

interface InventoryReport {
  productId: string
  productName: string
  stock: number
  threshold: number
}

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

function buildAlertData(type: InventoryAlertType, report: InventoryReport): NotificationData[InventoryAlertType] {
  switch (type) {
    case 'inventory.low_stock':
      return { productName: report.productName, stock: report.stock, threshold: report.threshold, targetId: report.productId }
    case 'inventory.out_of_stock':
      return { productName: report.productName, targetId: report.productId }
    case 'inventory.back_in_stock':
      return { productName: report.productName, stock: report.stock, targetId: report.productId }
  }
}

/**
 * Server-authoritative inventory transition report (spec §4). The client never
 * states "alert or not" — it reports observed stock and the server:
 *   1. reads product_alert_cycle (persistent transition truth),
 *   2. decides the transition (NORMAL → LOW_STOCK → OUT_OF_STOCK → NORMAL),
 *   3. persists the cycle UNCONDITIONALLY (even when the alert is gated off
 *      or already deduped, so a later report sees the true previous state),
 *   4. gates via notification_preferences and projects a notification record
 *      FIRST (UNIQUE(tenant_id, dedupe_key) = exactly-once), SSE best-effort.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId!
    const userId = auth.userId!

    const body = await validateJsonBody<Partial<InventoryReport>>(request, {
      fields: {
        productId: { required: true, type: 'string', min: 1, max: 160 },
        productName: { required: true, type: 'string', min: 1, max: 200 },
        stock: { required: true, type: 'number', min: 0, max: 1_000_000_000 },
        threshold: { required: true, type: 'number', min: 0, max: 1_000_000_000 },
      },
    })
    if (body.response) return body.response

    const report = body.data as InventoryReport

    const { data: cycleRow } = await supabaseAdmin
      .from('product_alert_cycle')
      .select('alert_state, cycle')
      .eq('tenant_id', tenantId)
      .eq('product_id', report.productId)
      .maybeSingle()

    const prev: ProductAlertCycleState = {
      alertState: (cycleRow?.alert_state as ProductAlertState) ?? 'NORMAL',
      cycle: cycleRow?.cycle ?? 0,
    }

    const next = getStockStatus(report.stock, report.threshold)
    const decision = computeInventoryAlert(prev, next, report.productId)

    // Persist the transition truth regardless of gating/dedupe.
    await supabaseAdmin.from('product_alert_cycle').upsert(
      {
        tenant_id: tenantId,
        product_id: report.productId,
        alert_state: decision.status,
        cycle: decision.cycle,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,product_id' },
    )

    let alertCreated = false
    let createdId: string | null = null
    let createdTitle: string | null = null

    if (decision.alert && decision.dedupeKey) {
      const prefs = await loadPreferences(tenantId)
      if (shouldNotify(prefs, decision.alert)) {
        const record = buildNotification({
          type: decision.alert,
          data: buildAlertData(decision.alert, report),
          tenantId,
          recipientUserId: userId,
          dedupeKey: decision.dedupeKey,
        })

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
          if ((error as { code?: string }).code !== '23505') {
            console.error(`[Notifications] Failed to persist ${record.type}:`, error.message)
          }
        } else {
          alertCreated = true
          createdId = inserted?.id ?? null
          createdTitle = record.title

          // SSE fan-out best-effort — mirrors the worker wire shape so the
          // frontend feed/badge can use it (in-app center reads the DB).
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
        }
      }
    }

    return NextResponse.json({
      ok: true,
      status: decision.status,
      cycle: decision.cycle,
      transitioned: prev.alertState !== decision.status,
      alert: decision.alert,
      alertCreated,
      id: createdId,
      title: createdTitle,
    })
  } catch (error) {
    console.error('[Notifications] Inventory report failed:', error instanceof Error ? error.message : error)
    return errorResponse('Failed to process inventory report', 500)
  }
}