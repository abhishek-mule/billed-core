// worker/src/lib/recovery/reducer.ts

export type Status = 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'cancelled';

export interface FinancialProjection {
  invoiceAmount: number;
  totalPaid: number;
  totalReversed: number;
  totalAdjusted: number;
  outstanding: number;
  status: Status;
}

export type AdjustmentType = 'credit' | 'debit';

export type Event = 
  | { type: 'invoice.created'; amount: number }
  | { type: 'invoice.adjusted'; amount: number; adjustmentType: AdjustmentType }
  | { type: 'payment.recorded' | 'payment.received'; amount: number }
  | { type: 'payment.reversed'; amount: number }
  | { type: 'invoice.cancelled' };

export const INITIAL_PROJECTION: FinancialProjection = {
  invoiceAmount: 0,
  totalPaid: 0,
  totalReversed: 0,
  totalAdjusted: 0,
  outstanding: 0,
  status: 'unpaid',
};

export function applyEvent(p: FinancialProjection, e: Event): FinancialProjection {
  switch (e.type) {
    case 'invoice.created':
      return { 
        ...INITIAL_PROJECTION,
        invoiceAmount: e.amount,
        outstanding: e.amount,
        status: 'unpaid'
      };

    case 'invoice.adjusted':
      const delta = e.adjustmentType === 'credit' ? -e.amount : e.amount;
      const newAdjusted = p.totalAdjusted + delta;
      const adjOutstanding = p.invoiceAmount - p.totalPaid + p.totalReversed + newAdjusted;
      return {
        ...p,
        totalAdjusted: newAdjusted,
        outstanding: adjOutstanding,
        status: adjOutstanding <= 0 ? 'paid' : 'partial'
      };

    case 'payment.recorded':
    case 'payment.received':
      if (e.amount > p.outstanding && p.status !== 'unpaid') {
          // Allow small tolerance, but strict check is 'unpaid' can exceed
      }
      const newPaid = p.totalPaid + e.amount;
      const outstanding = p.invoiceAmount - newPaid + p.totalReversed + p.totalAdjusted;
      return {
        ...p,
        totalPaid: newPaid,
        outstanding,
        status: outstanding < 0 ? 'overpaid' : (outstanding === 0 ? 'paid' : 'partial')
      };

    case 'payment.reversed':
      if (e.amount > p.totalPaid) throw new Error('Reversal exceeds total paid');
      const newReversed = p.totalReversed + e.amount;
      const revOutstanding = p.invoiceAmount - p.totalPaid + newReversed + p.totalAdjusted;
      return {
        ...p,
        totalReversed: newReversed,
        outstanding: revOutstanding,
        status: revOutstanding === 0 ? 'paid' : 'partial'
      };

    case 'invoice.cancelled':
      if (p.totalPaid > 0) throw new Error('Cannot cancel invoice with payments');
      return { ...p, status: 'cancelled', outstanding: 0 };
      
    default:
      return p;
  }
}
