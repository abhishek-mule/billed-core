import { db } from '@/lib/db';
import { tenants, invoices, customers } from '@/lib/schema';
import { enqueueJob, QUEUES } from '@/lib/queue';
import { eq, ne, sql } from 'drizzle-orm';

export async function sendDailyCollectionSummary() {
  const allTenants = await db.select().from(tenants).where(eq(tenants.subscriptionStatus, 'pro'));

  for (const tenant of allTenants) {
    const worklist = await db.query.customers.findMany({
      where: eq(customers.tenantId, tenant.id),
      with: { invoices: true }
    });

    const summary = worklist
      .filter(c => Number(c.udharBalance) > 0)
      .sort((a, b) => Number(b.udharBalance) - Number(a.udharBalance))
      .slice(0, 3);

    if (summary.length > 0) {
      const message = `🔥 Today's Collections:\n${summary.map((c, i) => 
        `${i + 1}. ${c.customerName} – ₹${c.udharBalance}`
      ).join('\n')}\n\nOpen Billzo to collect now.`;

      await enqueueJob(QUEUES.invoiceNotification, {
        type: 'daily_summary',
        tenantId: tenant.id,
        phone: tenant.contactPhone, // Assuming contactPhone exists or is primary owner
        message
      });
    }
  }
}
