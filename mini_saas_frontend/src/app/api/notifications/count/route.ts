import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { verifyRequest } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

// GET /api/notifications/count — server-computed unread count for the bell badge.
export async function GET(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { count, error } = await supabaseAdmin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_read', false)

    if (error) throw error

    return NextResponse.json({ unreadCount: count ?? 0 })
  } catch (err: any) {
    console.error('[Notifications] count error:', err)
    return NextResponse.json({ unreadCount: 0, error: err.message })
  }
}