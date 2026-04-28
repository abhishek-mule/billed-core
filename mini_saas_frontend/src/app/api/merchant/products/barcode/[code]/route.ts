import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { queryOne } from '@/lib/db/client'

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const barcode = params.code.trim()
    if (!barcode) {
      return NextResponse.json({ error: 'Barcode required' }, { status: 400 })
    }

    const product = await queryOne<Record<string, any>>(
      `SELECT id, tenant_id, item_code, item_name, hsn_code, barcode, aliases,
              rate, standard_rate, mrp, gst_rate, stock_qty, unit, category, is_active
       FROM products 
       WHERE tenant_id = $1 AND barcode = $2 AND is_active = true`,
      [session.tenantId, barcode]
    )

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found', code: barcode },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        id: product.id,
        item_name: product.item_name,
        item_code: product.item_code,
        barcode: product.barcode,
        aliases: product.aliases || [],
        rate: parseFloat(product.rate || '0'),
        standard_rate: parseFloat(product.standard_rate || '0'),
        mrp: parseFloat(product.mrp || '0'),
        gst_rate: parseFloat(product.gst_rate || '18'),
        stock_quantity: parseFloat(product.stock_qty || '0'),
        unit: product.unit,
        category: product.category,
      },
    })
  } catch (e) {
    console.error('[Barcode Lookup] error:', e)
    return NextResponse.json({ error: 'Failed to lookup barcode' }, { status: 500 })
  }
}