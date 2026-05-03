import { db } from '@/lib/db';
import { invoices, outbox, failedJobs } from '@/lib/schema';
import { eq, and, lt } from 'drizzle-orm';
import { enqueueJob, QUEUES } from '@/lib/queue';

export async function processOutbox() {
  const pending = await db.query.outbox.findMany({
    where: and(
      eq(outbox.status, 'pending'),
      lt(outbox.retryCount, 3)
    )
  });

  for (const item of pending) {
    // 1. Mark as processing
    await db.update(outbox).set({ status: 'processing', lastAttemptAt: new Date() }).where(eq(outbox.id, item.id));

    try {
      // 2. Enqueue
      await enqueueJob(QUEUES.invoiceNotification, item.payload as Record<string, unknown>);
      
      // 3. Mark as done
      await db.update(outbox).set({ status: 'done' }).where(eq(outbox.id, item.id));
    } catch (e) {
      // 4. Handle failure
      await db.update(outbox).set({ 
        status: 'pending', 
        retryCount: (item.retryCount ?? 0) + 1
        }).where(eq(outbox.id, item.id));

        if ((item.retryCount ?? 0) >= 2) {

        await db.insert(failedJobs).values({
          tenantId: item.tenantId,
          queue: QUEUES.invoiceNotification,
          payload: item.payload,
          errorMessage: String(e)
        });
        await db.update(outbox).set({ status: 'failed' }).where(eq(outbox.id, item.id));
      }
    }
  }
}
