import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not available in production' }, { status: 404 })
    }
    const secretKey = request.headers.get('x-dev-key')
    if (secretKey !== process.env.DEV_API_KEY) {
      return NextResponse.json({ error: 'Forbidden: Invalid or missing dev API key' }, { status: 403 })
    }
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
