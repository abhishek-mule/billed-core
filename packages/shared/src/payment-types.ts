// ============================================================
// PAYMENT TYPES — Unified Payment Ledger
// ============================================================
// These types describe payments flowing into the unified ledger.
// Every payment (regardless of source: Razorpay, cash, bank
// transfer, etc.) is recorded as a row in the `payments` table
// with a canonical `PaymentSource` enum value.
//
// The `outstanding_amount` on invoices is maintained by a
// Postgres trigger (`trg_maintain_invoice_outstanding`) that
// recalculates on every INSERT/UPDATE/DELETE to the payments
// table.
// ============================================================

export const PAYMENT_SOURCES = [
  'cash',
  'razorpay',
  'bank_transfer',
  'cheque',
  'adjustment',
  'upi',
] as const
export type PaymentSource = (typeof PAYMENT_SOURCES)[number]

export type PaymentActor = 'customer' | 'merchant' | 'razorpay_auto' | 'system'

export interface PaymentEvidence {
  razorpayPaymentId?: string
  razorpayOrderId?: string
  utr?: string
  chequeNumber?: string
  bankReference?: string
  notes?: string
}

export interface PaymentRecord {
  id: string
  tenantId: string
  invoiceId: string
  amount: number
  paymentMode: string
  source: PaymentSource
  status: string
  actor: PaymentActor
  evidence: PaymentEvidence
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface RecordPaymentInput {
  tenantId: string
  invoiceId: string
  amount: number
  source: PaymentSource
  actor: PaymentActor
  evidence?: PaymentEvidence
  notes?: string
}
