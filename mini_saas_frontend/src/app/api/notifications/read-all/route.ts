import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { verifyRequest } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

// POST /api/notifications/read-all — idempotent bulk mark-read (scope: tenant).
export async function POST(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('tenant_id', tenantId)
      .eq('is_read', false)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[Notifications] read-all error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}