import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/billzo/supabase'
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

    if (!supabase) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 })
    }

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)

    if (error) {
      console.error('[Products/GET] Supabase error:', error.message)
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
    }

    const products: Product[] = (data || []).map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      name: row.item_name,
      barcode: row.barcode,
      hsn: row.hsn_code,
      gstRate: row.gst_rate ?? 0,
      stock: row.stock_quantity ?? 0,
      lowStockAt: row.low_stock_at ?? 10,
      salePrice: row.rate ?? 0,
      purchasePrice: row.standard_rate ?? 0,
      unit: row.unit,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))

    return NextResponse.json({ success: true, products })
  } catch (error: any) {
    console.error('[Products/GET] Error:', error?.message || error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
