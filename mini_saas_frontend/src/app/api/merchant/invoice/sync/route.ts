import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query } from '@/lib/db/client'
import { enqueueJobWithRetry, QUEUES } from '@/lib/queue'
import { processErpSyncJob } from '@/lib/orchestration/erp-sync-worker'

export const dynamic = 'force-dynamic'

interface QueueJob {
  id: string
  queue: string
  payload: any
  createdAt: number
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || session.role !== 'owner') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  try {
    switch (action) {
      case 'retry-sync': {
        const { invoiceId } = await request.json()
        
        if (!invoiceId) {
          return NextResponse.json({ error: 'invoiceId required' }, { status: 400 })
        }

        // Get invoice details
        const invoices = await query<any>(
          'SELECT id, tenant_id, invoice_number FROM invoices WHERE id = $1 AND tenant_id = $2',
          [invoiceId, session.tenantId]
        )

        if (invoices.length === 0) {
          return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
        }

        // Enqueue sync job
        await enqueueJobWithRetry(QUEUES.erpSync, { 
          tenantId: session.tenantId, 
          invoiceId: invoices[0].id, 
          invoiceNumber: invoices[0].invoice_number 
        }, 3)

        return NextResponse.json({ 
          success: true, 
          message: 'Sync queued. Check status in a few seconds.' 
        })
      }

      case 'trigger-pending-sync': {
        // Get all pending invoices
        const pending = await query<any>(
          `SELECT id, tenant_id, invoice_number, erp_sync_status 
           FROM invoices 
           WHERE tenant_id = $1 AND erp_sync_status IN ('PENDING', 'RETRY')
           ORDER BY created_at DESC 
           LIMIT 20`,
          [session.tenantId]
        )

        if (pending.length === 0) {
          return NextResponse.json({ success: true, message: 'No pending invoices' })
        }

        // Enqueue sync jobs for each
        for (const inv of pending) {
          await enqueueJobWithRetry(QUEUES.erpSync, { 
            tenantId: session.tenantId, 
            invoiceId: inv.id, 
            invoiceNumber: inv.invoice_number 
          }, 3)
        }

        return NextResponse.json({ 
          success: true, 
          message: `Queued ${pending.length} invoices for sync` 
        })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('[Invoice Sync] Error:', error)
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const invoiceId = searchParams.get('id')

  if (invoiceId) {
    const invoices = await query<any>(
      `SELECT id, invoice_number, customer_name, total, erp_sync_status, 
              erp_synced_at, erp_sync_error, erp_invoice_id, created_at
       FROM invoices 
       WHERE id = $1 AND tenant_id = $2`,
      [invoiceId, session.tenantId]
    )

    if (invoices.length === 0) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const inv = invoices[0]
    return NextResponse.json({
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      customerName: inv.customer_name,
      total: parseFloat(inv.total),
      syncStatus: inv.erp_sync_status,
      erpInvoiceId: inv.erp_invoice_id,
      syncedAt: inv.erp_synced_at,
      syncError: inv.erp_sync_error,
      createdAt: inv.created_at,
    })
  }

  // Get sync stats
  const stats = await query<{ status: string; count: string }>(
    `SELECT erp_sync_status as status, COUNT(*) as count 
     FROM invoices 
     WHERE tenant_id = $1 
     GROUP BY erp_sync_status`,
    [session.tenantId]
  )

  const summary = {
    total: 0,
    synced: 0,
    pending: 0,
    failed: 0,
  }

  for (const s of stats) {
    const count = parseInt(s.count)
    summary.total += count
    if (s.status === 'SYNCED') summary.synced = count
    else if (s.status === 'PENDING' || s.status === 'RETRY') summary.pending = count
    else if (s.status === 'FAILED') summary.failed = count
  }

  return NextResponse.json({ summary })
}