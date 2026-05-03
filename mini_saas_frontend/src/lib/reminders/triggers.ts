import { db } from '@/lib/db';
import { invoices } from '@/lib/schema';
import { enqueueJob, QUEUES } from '@/lib/queue';
import { eq, and, gt, sql } from 'drizzle-orm';

export async function detectTriggerEvents() {
  const now = new Date();
  
  // 1. Detect Read but Unpaid
  const readButUnpaid = await db.query.invoices.findMany({
    where: and(eq(invoices.waStatus, 'read'), eq(invoices.paymentStatus, 'unpaid')),
    with: { customer: true, tenant: true }
  });

  for (const inv of readButUnpaid) {
    // Alert merchant: "Ravi saw invoice but didn't pay. Follow up now."
    await enqueueJob(QUEUES.invoiceNotification, {
      type: 'trigger_alert',
      tenantId: inv.tenantId,
      phone: inv.tenant.contactPhone,
      message: `${inv.customer?.customerName || 'A customer'} read your invoice ₹${inv.grandTotal} but hasn't paid yet. Send a nudge.`
    });
  }

  // 2. Detect Inactivity (No follow-ups in 3 days)
  const inactiveMerchants = await db.execute(sql`
    SELECT tenant_id FROM invoices 
    WHERE last_follow_up_at < NOW() - INTERVAL '3 days'
    AND payment_status != 'paid'
    GROUP BY tenant_id
  `);

  // ... notify inactive merchants
}
