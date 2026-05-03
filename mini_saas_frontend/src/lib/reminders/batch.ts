import { db } from '@/lib/db';
import { invoices } from '@/lib/schema';
import { decideReminder } from './engine';
import { enqueueJob, QUEUES } from '@/lib/queue';
import { eq } from 'drizzle-orm';

export async function runReminderBatch() {
  const unpaidInvoices = await db.query.invoices.findMany({
    where: (i, { ne }) => ne(i.paymentStatus, 'paid'),
    with: { customer: true }
  });

  for (const inv of unpaidInvoices) {
    const tone = decideReminder(inv);
    
    if (tone) {
      await enqueueJob(QUEUES.invoiceNotification, { 
        invoiceId: inv.id,
        tone: tone,
        type: 'reminder'
      });
      
      await db.update(invoices)
        .set({ 
          lastReminderAt: new Date(),
          reminderCount: (inv.reminderCount || 0) + 1
        })
        .where(eq(invoices.id, inv.id));
    }
  }
}
