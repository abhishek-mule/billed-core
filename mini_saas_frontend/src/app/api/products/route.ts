import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseTenants } from '@/lib/billzo/supabase'
import type { Product } from '@/lib/billzo/types'

export const dynamic = 'force-dynamic'

function getTenantId(): string | null {
  const cookieStore = cookies()
  return cookieStore.get('bz_tenant')?.value || null
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = getTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tenantsTable = await supabaseTenants()
    if (!tenantsTable) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 })
    }

    const { data, error } = await tenantsTable
      .select('products')
      .eq('id', tenantId)
      .single()

    if (error) {
      console.error('[Products/GET] Supabase error:', error.message)
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
    }

    const products: Product[] = data?.products || []
    return NextResponse.json({ success: true, products })
  } catch (error: any) {
    console.error('[Products/GET] Error:', error?.message || error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
