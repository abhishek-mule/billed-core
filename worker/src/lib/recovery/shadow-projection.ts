// ============================================================
// Shadow Projection — Parallel Truth Engine
// ============================================================
//
// Maintains shadow_recovery_cases for financial truth verification.
// Runs alongside real recovery_cases to detect drifts before cutover.
//
// Architecture invariant: Shadow should NEVER contain behavioral data.
// Only fields affecting business decisions are tracked.
//
// Design:
//   - In-memory per-invoice financial state (Map<invoiceId, FinancialProjection>)
//   - Events applied to individual invoice state via pure reducer
//   - Customer aggregates computed by summing invoice states
//   - Compared with real recovery_cases for zero-drift verification

import { supabaseAdmin } from '../../lib/billzo/supabase-admin'
import { applyEvent, type FinancialProjection, type Status, type Event as RecoveryEvent, INITIAL_PROJECTION } from './reducer'

const logger = {
  info: (msg: string, ...args: any[]) => console.log(`[ShadowProjection] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(`[ShadowProjection] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[ShadowProjection] ${msg}`, ...args),
}

// Per-invoice financial state (reconstructed from the reducer)
// Key: `${tenantId}:${invoiceId}`
const invoiceStates = new Map<string, FinancialProjection>()

// Track which invoices belong to which customer for aggregate computation
// Key: `${tenantId}:${customerId}` → Set<invoiceId>
const customerInvoices = new Map<string, Set<string>>()

export class ShadowProjection {
  private supabase: any = supabaseAdmin

  async startShadowProjection(): Promise<void> {
    logger.info('Shadow projection engine ready')
  }

  async processEvent(event: any): Promise<void> {
    if (!this.canHandleEvent(event.type)) return

    try {
      const tenantId = event.tenantId || event.payload?.tenantId
      if (!tenantId) return

      const invoiceId = event.entityId || event.payload?.invoiceId
      if (!invoiceId) return

      const result = await this.updateInvoiceState(tenantId, invoiceId, event)
      if (result?.customerId) {
        await this.updateCustomerAggregate(tenantId, result.customerId)
      }
    } catch (error) {
      logger.error('Error processing event:', event.type, error)
    }
  }

  canHandleEvent(eventType: string): boolean {
    return [
      'payment.recorded',
      'payment.received',
      'payment.reversed',
      'invoice.created',
      'invoice.adjusted',
      'invoice.cancelled',
    ].includes(eventType)
  }

  private async updateInvoiceState(
    tenantId: string,
    invoiceId: string,
    event: any
  ): Promise<{ customerId: string } | null> {
    const stateKey = `${tenantId}:${invoiceId}`

    // Resolve invoice and customer
    let invoice: any = await this.loadInvoice(tenantId, invoiceId)
    if (!invoice) return null

    const customerId = invoice.customer_id
    if (!customerId) return null

    // Get or initialize invoice financial state
    let currentState = invoiceStates.get(stateKey)
    if (!currentState) {
      currentState = {
        invoiceAmount: Number(invoice.total) || 0,
        totalPaid: Number(invoice.paid_amount) || 0,
        totalReversed: 0,
        totalAdjusted: 0,
        outstanding: Number(invoice.outstanding_amount) ?? (Number(invoice.total) - Number(invoice.paid_amount)),
        status: this.invoiceStatusFromRow(invoice),
      }
    }

    // Apply the event to compute next state
    const recoveryEvent: RecoveryEvent = {
      type: event.type as any,
      amount: event.payload?.amount || event.payload?.total || 0,
      adjustmentType: event.payload?.adjustmentType,
      reason: event.payload?.reason || '',
    } as any

    try {
      const nextState = applyEvent(currentState, recoveryEvent)
      invoiceStates.set(stateKey, nextState)

      // Track this invoice under this customer
      const customerKey = `${tenantId}:${customerId}`
      if (!customerInvoices.has(customerKey)) {
        customerInvoices.set(customerKey, new Set())
      }
      customerInvoices.get(customerKey)!.add(invoiceId)

      return { customerId }
    } catch (err) {
      logger.error(`Reducer failed for invoice ${invoiceId} event ${event.id}:`, err)
      return null
    }
  }

  private async updateCustomerAggregate(tenantId: string, customerId: string): Promise<void> {
    const customerKey = `${tenantId}:${customerId}`
    const invoiceIds = customerInvoices.get(customerKey)

    if (!invoiceIds || invoiceIds.size === 0) return

    // Compute aggregate from all invoice states
    let totalOutstanding = 0
    let invoiceCount = 0
    let overdueCount = 0
    let openCount = 0

    for (const invId of invoiceIds) {
      const stateKey = `${tenantId}:${invId}`
      const state = invoiceStates.get(stateKey)
      if (!state) continue

      invoiceCount++
      if (state.outstanding > 0) {
        openCount++
        totalOutstanding += state.outstanding
        // An invoice with past due date and outstanding amount is overdue
        const isOverdue = await this.isInvoiceOverdue(tenantId, invId)
        if (isOverdue) {
          overdueCount++
        }
      }
    }

    // Determine recovery state from aggregate
    const recoveryState = this.computeRecoveryState(totalOutstanding, openCount)

    // Upsert shadow case with decision-critical fields only
    try {
      await this.supabase.from('shadow_recovery_cases').upsert({
        tenant_id: tenantId,
        customer_id: customerId,
        total_outstanding: totalOutstanding,
        total_overdue: totalOutstanding >= 0 ? totalOutstanding : 0,
        open_invoice_count: openCount,
        overdue_invoice_count: overdueCount,
        recovery_state: recoveryState,
        projection_version: this.getNextProjectionVersion(tenantId, customerId),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id, customer_id' })

      logger.info(`Shadow for customer ${customerId}: outstanding=${totalOutstanding} state=${recoveryState}`)
    } catch (err) {
      logger.error(`Failed to upsert shadow for customer ${customerId}:`, err)
    }
  }

  private async loadInvoice(tenantId: string, invoiceId: string): Promise<any> {
    const { data } = await this.supabase
      .from('invoices')
      .select('id, customer_id, total, paid_amount, outstanding_amount, due_date, status')
      .eq('id', invoiceId)
      .single()
    return data
  }

  private async isInvoiceOverdue(tenantId: string, invoiceId: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('invoices')
      .select('due_date, status')
      .eq('id', invoiceId)
      .single()
    if (!data) return false
    const dueDate = new Date(data.due_date)
    return dueDate < new Date() && data.status !== 'paid'
  }

  private invoiceStatusFromRow(invoice: any): Status {
    if (!invoice) return 'unpaid'
    if (invoice.status === 'cancelled') return 'cancelled'
    const outstanding = Number(invoice.outstanding_amount) ?? (Number(invoice.total) - Number(invoice.paid_amount))
    if (outstanding <= 0) return 'paid'
    if (outstanding < Number(invoice.total)) return 'partial'
    return 'unpaid'
  }

  private getNextProjectionVersion(tenantId: string, customerId: string): number {
    return 1 // Reset after restart; can be loaded from existing shadow
  }

  private computeRecoveryState(outstanding: number, openCount: number): string {
    if (outstanding <= 0) return 'recovered'
    if (openCount > 1 || outstanding > 0) return 'active'
    return 'active'
  }
}

export async function initializeShadowProjection() {
  const shadowProjection = new ShadowProjection()
  return shadowProjection
}
