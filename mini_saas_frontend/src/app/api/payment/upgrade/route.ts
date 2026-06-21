import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { verifyRequest } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!

  try {
    const body = await request.json()
    const { plan } = body as { plan: string }

    if (!plan || !['pro', 'growth'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .update({
        plan,
        paywall_unlocked: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)

    if (error) {
      console.error('[Upgrade] Supabase update failed:', error)
      return NextResponse.json({ error: 'Failed to upgrade plan' }, { status: 500 })
    }

    return NextResponse.json({ success: true, plan })
  } catch (err: any) {
    console.error('[Upgrade] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
