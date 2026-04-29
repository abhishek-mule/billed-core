import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'
import { generateId } from '@/lib/db/encryption'

export const dynamic = 'force-dynamic'

// GET - List purchases
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit
    const search = searchParams.get('search') || ''

    let whereClause = 'tenant_id = $1'
    const params: any[] = [session.tenantId]
    let paramIndex = 2

    if (search) {
      whereClause += ` AND (purchase_invoice_number ILIKE $${paramIndex} OR supplier_name ILIKE $${paramIndex})`
      params.push(`%${search}%`)
      paramIndex++
    }

    const countResult = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM purchases WHERE ${whereClause}`,
      params
    )
    const total = Number(countResult?.count) || 0

    const purchases = await query<any>(
      `SELECT * FROM purchases WHERE ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    )

    return NextResponse.json({
      success: true,
      data: purchases.map(p => ({
        id: p.id,
        purchaseInvoiceNumber: p.purchase_invoice_number,
        supplierName: p.supplier_name,
        supplierGstin: p.supplier_gstin,
        subtotal: Number(p.subtotal) || 0,
        cgst: Number(p.cgst) || 0,
        sgst: Number(p.sgst) || 0,
        igst: Number(p.igst) || 0,
        total: Number(p.total) || 0,
        grandTotal: Number(p.grand_total) || 0,
        invoiceDate: p.invoice_date,
        dueDate: p.due_date,
        status: p.status,
        paymentStatus: p.payment_status || 'UNPAID',
        paidAmount: Number(p.paid_amount) || 0,
        dueAmount: Number(p.due_amount) || 0,
        eligibleForItc: p.eligible_for_itc !== false,
        lineItems: p.line_items_json || [],
        createdAt: p.created_at
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    })

  } catch (error: any) {
    console.error('[Purchases List] Error:', error)
    return NextResponse.json({ error: 'Failed to load purchases' }, { status: 500 })
  }
}

// POST - Create purchase (from OCR scan or manual entry)
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      purchaseInvoiceNumber, 
      supplierName, 
      supplierGstin,
      supplierId,
      invoiceDate,
      dueDate,
      lineItems,
      subtotal,
      cgst,
      sgst,
      igst,
      total,
      grandTotal,
      notes,
      status,
      eligibleForItc
    } = body

    if (!purchaseInvoiceNumber || !supplierName) {
      return NextResponse.json({ error: 'Invoice number and supplier required' }, { status: 400 })
    }

    // Calculate due amount
    const paidAmount = 0
    const dueAmount = Number(grandTotal) || 0
    const paymentStatus = dueAmount === 0 ? 'PAID' : 'UNPAID'

    // Check for duplicate
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM purchases WHERE tenant_id = $1 AND purchase_invoice_number = $2',
      [session.tenantId, purchaseInvoiceNumber]
    )

    if (existing) {
      return NextResponse.json({ error: 'Purchase invoice already exists' }, { status: 409 })
    }

    const purchaseId = generateId('PO')

    await query(
      `INSERT INTO purchases (
        id, tenant_id, purchase_invoice_number, supplier_id, supplier_name, supplier_gstin,
        line_items_json, subtotal, cgst, sgst, igst, total, grand_total, invoice_date, due_date, status,
        payment_status, paid_amount, due_amount, eligible_for_itc, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW())`,
      [
        purchaseId, session.tenantId, purchaseInvoiceNumber, supplierId || '', supplierName, supplierGstin || '',
        JSON.stringify(lineItems || []), String(subtotal || 0), String(cgst || 0), String(sgst || 0), String(igst || 0),
        String(total || 0), String(grandTotal || 0), invoiceDate || null, dueDate || null, status || 'UNPAID',
        paymentStatus, String(paidAmount), String(dueAmount), eligibleForItc !== false ? true : false, notes || ''
      ]
    )

    // Update stock for each line item
    if (lineItems && lineItems.length > 0) {
      for (const item of lineItems) {
        if (item.productId && item.quantity) {
          await query(
            'UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2',
            [item.quantity, item.productId]
          )
        }
      }
    }

    return NextResponse.json({
      success: true,
      id: purchaseId,
      invoiceNumber: purchaseInvoiceNumber
    })

  } catch (error: any) {
    console.error('[Purchase Create] Error:', error)
    return NextResponse.json({ error: 'Failed to create purchase' }, { status: 500 })
  }
}