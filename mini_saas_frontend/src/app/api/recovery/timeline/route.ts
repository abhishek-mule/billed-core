import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getInvoiceRecoveryTimeline } from '@/lib/billzo/attribution'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('invoiceId')

    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 })
    }

    // Verify invoice belongs to tenant (Dexie-only invoices won't be in Supabase)
    let invoiceExists = true
    try {
      const { data: invoice } = await supabaseAdmin
        .from('invoices')
        .select('id, tenant_id')
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
        .single()
      if (!invoice) invoiceExists = false
    } catch {
      invoiceExists = false
    }

    if (!invoiceExists) {
      return NextResponse.json({ events: [], attribution: null })
    }

    // Get recovery timeline
    const timeline = await getInvoiceRecoveryTimeline(invoiceId)

    // Get attribution for this invoice
    let attribution = null
    try {
      const { data: attr } = await supabaseAdmin
        .from('recovery_attributions')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      attribution = attr
    } catch {
      attribution = null
    }

    return NextResponse.json({
      events: timeline.events || [],
      attribution: attribution || null,
    })
  } catch (err: any) {
    console.error('[RecoveryTimeline] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
