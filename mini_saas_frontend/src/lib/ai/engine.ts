import { db } from '@/lib/db';
import { invoices } from '@/lib/schema';
import { eq } from 'drizzle-orm';

type Tone = 'gentle' | 'nudge' | 'firm' | 'final';

interface Decision {
  action: 'wait' | 'remind' | 'escalate';
  tone: Tone | null;
  reason: string;
  confidence: number;
}

export function decideNextAction(invoice: any, customer: any): Decision {
  const daysSince = Math.floor((Date.now() - new Date(invoice.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  
  // Logic: Behavior-based adaptive prioritization
  if (invoice.waStatus === 'read' && invoice.paymentStatus === 'unpaid') {
    return {
      action: 'remind',
      tone: 'nudge',
      reason: 'Invoice viewed but unpaid; follow up to capitalize on intent.',
      confidence: 0.9
    };
  }

  if (customer.riskLevel === 'high' && daysSince > 3) {
    return {
      action: 'escalate',
      tone: 'firm',
      reason: 'High-risk customer with overdue balance; escalating for immediate attention.',
      confidence: 0.85
    };
  }

  if (invoice.waStatus === 'delivered' && daysSince > 2) {
    return {
      action: 'remind',
      tone: 'gentle',
      reason: 'Invoice delivered but not yet viewed; polite follow-up recommended.',
      confidence: 0.7
    };
  }

  return { action: 'wait', tone: null, reason: 'Pending customer engagement.', confidence: 1.0 };
}

export async function runAdaptiveEngine() {
  const unpaid = await db.query.invoices.findMany({
    where: eq(invoices.paymentStatus, 'unpaid'),
    with: { customer: true }
  });

  for (const inv of unpaid) {
    const decision = decideNextAction(inv, inv.customer);
    // ... logic to log decision or execute if 'Auto Mode' is enabled
    console.log(`[DECISION] Inv ${inv.invoiceNumber}: ${decision.reason} (Confidence: ${decision.confidence})`);
  }
}
