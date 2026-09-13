import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { verifyRequest } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

// PATCH /api/notifications/:id — mark one notification read.
// Idempotent: repeated calls are no-op updates scoped to the owning tenant.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = params
    const body = await request.json().catch(() => null)
    if (!body || body.read !== true) {
      return NextResponse.json({ error: 'Only { read: true } is supported' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[Notifications] mark-read error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}