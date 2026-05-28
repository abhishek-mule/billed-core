import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { generateGSTR1JSON } from '@/lib/billzo/gstr1'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { month, year } = body

    if (!month || !year || month < 1 || month > 12 || year < 2020 || year > 2030) {
      return NextResponse.json({ error: 'Invalid month or year' }, { status: 400 })
    }

    const gstr1Data = await generateGSTR1JSON(tenantId, month, year, supabaseAdmin)

    const filename = `GSTR1_${String(month).padStart(2, '0')}${year}.json`

    return new NextResponse(JSON.stringify(gstr1Data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err: any) {
    console.error('[GSTR1 Export] Error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to generate GSTR-1 export' },
      { status: 500 }
    )
  }
}
