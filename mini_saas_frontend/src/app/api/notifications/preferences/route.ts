import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, validateJsonBody, errorResponse } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import {
  mergePreferences,
  preferencesToRow,
  rowToPreferences,
  type PreferencesPatch,
} from '@/lib/billzo/notification-prefs'

export const dynamic = 'force-dynamic'

// Tenants may never read/write another tenant's preferences — every query is
// scoped by the verified tenantId.
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId!

    const { data, error } = await supabaseAdmin
      .from('notification_preferences')
      .select('push_enabled, recovery, payments, inventory, back_in_stock, updated_at')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ preferences: rowToPreferences(data as never) })
  } catch (error) {
    return errorResponse(error instanceof Error ? error : new Error('Failed to load preferences'), 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId!

    const body = await validateJsonBody<PreferencesPatch>(request, {
      fields: {
        pushEnabled: { type: 'boolean' },
        recovery: { type: 'boolean' },
        payments: { type: 'boolean' },
        inventory: { type: 'boolean' },
        backInStock: { type: 'boolean' },
      },
    })
    if (body.response) return body.response
    const patch = body.data ?? {}

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { data: current } = await supabaseAdmin
      .from('notification_preferences')
      .select('push_enabled, recovery, payments, inventory, back_in_stock, updated_at')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    const merged = mergePreferences(rowToPreferences(current as never), patch)
    const { error } = await supabaseAdmin
      .from('notification_preferences')
      .upsert({ tenant_id: tenantId, ...preferencesToRow(merged, new Date().toISOString()) }, { onConflict: 'tenant_id' })

    if (error) throw error

    return NextResponse.json({ preferences: merged })
  } catch (error) {
    return errorResponse(error instanceof Error ? error : new Error('Failed to save preferences'), 500)
  }
}