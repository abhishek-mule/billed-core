import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not available in production' }, { status: 404 })
    }
    const tenantId = request.cookies.get('bz_tenant')?.value
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized — missing bz_tenant cookie. Visit /auth/resolve first.' }, { status: 401 })
    }

    // Update tenant plan to 'pro' in Supabase
    const { error } = await supabaseAdmin
      .from('tenants')
      .update({
        plan: 'pro',
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)

    if (error) {
      return NextResponse.json({ error: `Supabase update failed: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Tenant plan upgraded to pro. Refresh the page to sync locally.',
    })
  } catch (err: any) {
    console.error('[Dev/Unlock] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
