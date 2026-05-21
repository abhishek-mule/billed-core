import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getInvoiceRecoveryTimeline } from '@/lib/billzo/attribution'

export const dynamic = 'force-dynamic'

function getTenantId(): string | null {
  return cookies().get('bz_tenant')?.value || null
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = getTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('invoiceId')

    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 })
    }

    // Verify invoice belongs to tenant
    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('id, tenant_id')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .single()

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Get recovery timeline
    const timeline = await getInvoiceRecoveryTimeline(invoiceId)

    // Get attribution for this invoice
    const { data: attribution } = await supabaseAdmin
      .from('recovery_attributions')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return NextResponse.json({
      events: timeline.events || [],
      attribution: attribution || null,
    })
  } catch (err: any) {
    console.error('[RecoveryTimeline] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
