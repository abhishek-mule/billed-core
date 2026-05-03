import { db } from '@/lib/db';
import { invoices } from '@/lib/schema';
import { sql } from 'drizzle-orm';

type ReminderTone = 'gentle' | 'nudge' | 'balance' | 'firm';

export function decideReminder(inv: any): ReminderTone | null {
  const now = new Date();
  const createdAt = new Date(inv.createdAt);
  const daysSince = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  
  // Anti-spam: No reminder if sent within last 24h
  if (inv.lastReminderAt && (now.getTime() - new Date(inv.lastReminderAt).getTime()) < (24 * 60 * 60 * 1000)) {
    return null;
  }

  // 1. Paid invoices - do nothing
  if (inv.paymentStatus === 'paid') return null;

  // 2. Partial payments - balance reminder
  if (inv.paymentStatus === 'partial') return 'balance';

  // 3. Read but unpaid - gentle nudge
  if (inv.waStatus === 'read' && inv.paymentStatus === 'unpaid' && daysSince >= 1) return 'gentle';

  // 4. Delivered but never read - nudge
  if (inv.waStatus === 'delivered' && inv.paymentStatus === 'unpaid' && daysSince >= 2) return 'nudge';

  // 5. Overdue (7+ days) - firm
  if (daysSince >= 7) return 'firm';

  return null;
}
