import { db } from '@/lib/db';
import { customers, invoices, payments } from '@/lib/schema';
import { eq, and, sql, gte, lt } from 'drizzle-orm';

export async function calculateRiskScore(customerId: string) {
  const customerInvoices = await db.select()
    .from(invoices)
    .where(eq(invoices.customerId, customerId));

  if (customerInvoices.length === 0) return { score: 50, level: 'medium' };

  let score = 50;
  const totalInvoices = customerInvoices.length;
  
  // 1. Payment Delay (days_to_pay)
  let totalDelay = 0;
  let delayedInvoices = 0;
  for (const inv of customerInvoices) {
    if (inv.paymentStatus === 'paid') {
      const paid = await db.query.payments.findFirst({ where: eq(payments.invoiceId, inv.id) });
      if (paid) {
        const delay = Math.max(0, (new Date(paid.createdAt || new Date()).getTime() - new Date(inv.createdAt || new Date()).getTime()) / (1000 * 60 * 60 * 24));
        totalDelay += delay;
        if (delay > 2) delayedInvoices++;
      }
    }
  }
  const avgDelay = totalDelay / totalInvoices;
  if (avgDelay < 2) score += 30;
  else if (avgDelay < 5) score += 20;
  else score -= 20;

  // 2. Overdue Frequency
  const overdueCount = customerInvoices.filter(i => i.status === 'unpaid' && new Date(i.dueDate!) < new Date()).length;
  const overdueRatio = overdueCount / totalInvoices;
  if (overdueRatio === 0) score += 30;
  else if (overdueRatio < 0.3) score += 10;
  else score -= 30;

  // Normalize
  score = Math.min(100, Math.max(0, score));
  
  const level = score >= 80 ? 'low' : score >= 50 ? 'medium' : 'high';
  return { score, level };
}

export async function runRiskScoreBatch() {
  const allCustomers = await db.select().from(customers);
  for (const cust of allCustomers) {
    const { score, level } = await calculateRiskScore(cust.id);
    await db.update(customers)
      .set({ riskScore: score, riskLevel: level })
      .where(eq(customers.id, cust.id));
  }
}
