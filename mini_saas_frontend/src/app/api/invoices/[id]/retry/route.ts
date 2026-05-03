import { db } from '@/lib/db';
import { invoices, outbox, activityLogs } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import { enqueueJob, QUEUES } from '@/lib/queue';

export async function POST(req: Request) {
  const { invoiceId } = await req.json();

  // 1. Reset state for retry
  await db.update(invoices)
    .set({ waStatus: 'pending', followUpStage: 0 })
    .where(eq(invoices.id, invoiceId));

  // 2. Re-enqueue
  await enqueueJob(QUEUES.invoiceNotification, {
    invoiceId,
    type: 'retry_manual'
  });

  await db.insert(activityLogs).values({
    tenantId: (await db.query.invoices.findFirst({where: eq(invoices.id, invoiceId)}))?.tenantId!,
    type: 'manual_retry',
    entityId: invoiceId,
    metadata: { reason: 'User initiated retry' }
  });

  return Response.json({ success: true });
}
