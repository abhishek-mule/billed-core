import { db } from '@/lib/db';
import { invoices } from '@/lib/schema';
import { enqueueJob, QUEUES } from '@/lib/queue';
import { eq, and, ne, lt, lte, or, sql } from 'drizzle-orm';

const STAGE_CONFIG = {
  0: { tone: null },
  1: { tone: 'gentle' },
  2: { tone: 'nudge' },
  3: { tone: 'firm' },
  4: { tone: 'final' },
  5: { tone: null } // stopped
};

export async function runFollowUpEngine() {
  const unpaidInvoices = await db.query.invoices.findMany({
    where: and(
      ne(invoices.paymentStatus, 'paid'),
      eq(invoices.manualPause, false),
      lt(invoices.followUpStage, 5)
    ),
    with: { customer: true }
  });

  for (const inv of unpaidInvoices) {
    if (shouldRemind(inv)) {
      const nextStage = (inv.followUpStage ?? 0) + 1;
      const config = STAGE_CONFIG[nextStage as keyof typeof STAGE_CONFIG];
      
      if (config.tone) {
        await enqueueJob(QUEUES.invoiceNotification, {
          invoiceId: inv.id,
          tone: config.tone,
          type: 'reminder'
        });

        await db.update(invoices)
          .set({ 
            followUpStage: nextStage,
            lastFollowUpAt: new Date()
          })
          .where(eq(invoices.id, inv.id));
      }
    }
  }
}

function shouldRemind(inv: any): boolean {
  const now = new Date();
  const lastFollowUp = inv.lastFollowUpAt ? new Date(inv.lastFollowUpAt) : new Date(inv.createdAt);
  const hoursSinceLast = (now.getTime() - lastFollowUp.getTime()) / (1000 * 60 * 60);
  
  // 24h cooldown
  if (hoursSinceLast < 24) return false;

  const daysSince = Math.floor((now.getTime() - new Date(inv.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  switch(inv.followUpStage) {
    case 0: // Sent invoice
      return daysSince >= 1;
    case 1: // Gentle reminder
      return inv.waStatus === 'read';
    case 2: // Nudge
      return daysSince >= 3;
    case 3: // Firm
      return daysSince >= 7;
    default:
      return false;
  }
}
