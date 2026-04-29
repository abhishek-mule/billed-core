import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

// POST - Record payment for a purchase
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { purchaseId, amount, method, notes } = body

    if (!purchaseId || !amount) {
      return NextResponse.json({ error: 'Purchase ID and amount required' }, { status: 400 })
    }

    // Get current purchase
    const purchases = await query<any>(
      'SELECT * FROM purchases WHERE id = $1 AND tenant_id = $2',
      [purchaseId, session.tenantId]
    )

    if (!purchases || purchases.length === 0) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })
    }

    const purchase = purchases[0]
    const currentPaid = Number(purchase.paid_amount) || 0
    const grandTotal = Number(purchase.grand_total) || 0
    const newPaid = currentPaid + Number(amount)
    const newDue = Math.max(0, grandTotal - newPaid)
    const newStatus = newDue === 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID'

    // Update payment
    await query(
      `UPDATE purchases SET 
        paid_amount = $1,
        due_amount = $2,
        payment_status = $3,
        payment_method = $4,
        status = $5,
        updated_at = NOW()
      WHERE id = $6`,
      [
        String(newPaid),
        String(newDue),
        newStatus,
        method || 'cash',
        newStatus,
        purchaseId
      ]
    )

    return NextResponse.json({
      success: true,
      paidAmount: newPaid,
      dueAmount: newDue,
      status: newStatus
    })

  } catch (error: any) {
    console.error('[Purchase Payment] Error:', error)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }
}