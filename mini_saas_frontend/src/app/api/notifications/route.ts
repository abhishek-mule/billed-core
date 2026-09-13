import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { verifyRequest } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

const LIST_LIMIT = 100

// GET /api/notifications — in-app center feed + server-computed unread count.
// The notifications table is the source of truth; this route is read-only.
export async function GET(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { data: items, error } = await supabaseAdmin
      .from('notifications')
      .select('id, type, level, title, body, target_type, target_id, action, is_read, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT)

    if (error) throw error

    const { count: unreadCount, error: countError } = await supabaseAdmin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_read', false)

    if (countError) throw countError

    return NextResponse.json({ items: items || [], unreadCount: unreadCount ?? 0 })
  } catch (err: any) {
    console.error('[Notifications] GET error:', err)
    return NextResponse.json({ items: [], unreadCount: 0, error: err.message })
  }
}